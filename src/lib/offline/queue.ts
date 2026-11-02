/**
 * Fila de escrita offline (outbox) + drenagem para `/api/sync`.
 *
 * Regras:
 * - Ordem de `createdAt` (FIFO). A primeira operacao que nao puder ser
 *   resolvida **para** o lote: as seguintes esperam a proxima tentativa.
 * - Operacao com `operationId` e idempotente no servidor: reenviar e seguro.
 * - Erro de rede mantem tudo; `IN_PROGRESS` mantem e tenta depois; conflito
 *   deterministico remove e avisa a UI; erro comum tenta ate 3 vezes.
 */

import {
  idbDelete,
  idbGetAll,
  idbPut,
  STORE_OUTBOX,
} from './db'
import type {
  OfflineOperation,
  OfflineOperationKind,
  OfflineOperationPayload,
  SyncResultItem,
} from './types'

const FLUSH_BATCH_SIZE = 20
const FLUSH_TIMEOUT_MS = 10_000
const MAX_ATTEMPTS = 3

export type FlushStatus =
  | 'ok'
  | 'partial'
  | 'empty'
  | 'offline'
  | 'unauthorized'
  | 'error'

export type FlushSummary = {
  status: FlushStatus
  /** Operacoes incluidas em lotes enviados ao servidor. */
  sent: number
  /** Operacoes removidas da fila (sucesso ou conflito definitivo). */
  removed: number
  /** Pendentes ao final da tentativa. */
  pending: number
  conflicts: string[]
  errors: string[]
}

type PendingListener = () => void

const listeners = new Set<PendingListener>()

function notifyPending(): void {
  for (const listener of listeners) {
    try {
      listener()
    } catch {
      // Um listener quebrado nao pode derrubar o flush.
    }
  }
}

/** Notifica quando a fila muda (enqueue, flush, remocao). */
export function subscribePending(listener: PendingListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function createOperationId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID()
  }

  // Fallback RFC 4122 v4 (WebViews antigos sem randomUUID).
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256)
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('')

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export async function listPendingOperations(): Promise<OfflineOperation[]> {
  const items = await idbGetAll<OfflineOperation>(STORE_OUTBOX, 'createdAt')
  return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function pendingCount(): Promise<number> {
  return (await listPendingOperations()).length
}

export async function enqueueOperation(
  kind: OfflineOperationKind,
  payload: OfflineOperationPayload,
  operationId = createOperationId()
): Promise<OfflineOperation> {
  const operation: OfflineOperation = {
    operationId,
    kind,
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
  }

  await idbPut(STORE_OUTBOX, operation)
  notifyPending()
  return operation
}

async function removeOperation(operationId: string): Promise<void> {
  await idbDelete(STORE_OUTBOX, operationId)
}

async function registerAttempt(
  operation: OfflineOperation
): Promise<number> {
  const attempts = operation.attempts + 1
  await idbPut(STORE_OUTBOX, { ...operation, attempts })
  return attempts
}

type PostBatchResult =
  | { status: 'ok'; results: SyncResultItem[] }
  | { status: 'offline' | 'unauthorized' | 'error' }

async function postBatch(
  batch: OfflineOperation[]
): Promise<PostBatchResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FLUSH_TIMEOUT_MS)

  try {
    const response = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        ops: batch.map(({ operationId, kind, payload }) => ({
          operationId,
          kind,
          payload,
        })),
      }),
      signal: controller.signal,
    })

    // Sessao expirada: o proxy pode redirecionar para /login.
    if (response.status === 401 || response.redirected) {
      return { status: 'unauthorized' }
    }
    if (!response.ok) return { status: 'error' }

    const data = (await response.json()) as { results?: SyncResultItem[] }
    return { status: 'ok', results: data.results ?? [] }
  } catch {
    return { status: 'offline' }
  } finally {
    clearTimeout(timeout)
  }
}

let inFlight: Promise<FlushSummary> | null = null

/** Drena a fila (uma execucao por vez). Seguro chamar varias vezes. */
export function flushQueue(): Promise<FlushSummary> {
  if (inFlight) return inFlight
  inFlight = runFlush().finally(() => {
    inFlight = null
  })
  return inFlight
}

async function runFlush(): Promise<FlushSummary> {
  const summary: FlushSummary = {
    status: 'empty',
    sent: 0,
    removed: 0,
    pending: 0,
    conflicts: [],
    errors: [],
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    summary.status = 'offline'
    summary.pending = await pendingCount()
    return summary
  }

  const pending = await listPendingOperations()
  if (pending.length === 0) return summary

  let stop = false

  for (
    let index = 0;
    index < pending.length && !stop;
    index += FLUSH_BATCH_SIZE
  ) {
    const batch = pending.slice(index, index + FLUSH_BATCH_SIZE)
    const response = await postBatch(batch)

    if (response.status === 'offline') {
      summary.status = 'offline'
      break
    }
    if (response.status === 'unauthorized') {
      summary.status = 'unauthorized'
      break
    }
    if (response.status === 'error') {
      summary.status = 'error'
      break
    }

    summary.sent += batch.length
    const results = response.status === 'ok' ? response.results : []
    const byId = new Map(
      results.map((result) => [result.operationId, result])
    )

    for (const operation of batch) {
      const result = byId.get(operation.operationId)

      if (!result) {
        summary.errors.push('Resposta de sincronização incompleta.')
        stop = true
        break
      }

      if (result.ok) {
        await removeOperation(operation.operationId)
        summary.removed += 1
        continue
      }

      if (result.code === 'IN_PROGRESS') {
        // Outra execucao ainda esta em andamento: mantenha a ordem.
        stop = true
        break
      }

      if (result.code === 'CONFLICT' || result.code === 'INVALID') {
        // Erro definitivo: reenviar nao muda o resultado.
        await removeOperation(operation.operationId)
        summary.removed += 1
        summary.conflicts.push(operation.operationId)
        if (result.error) summary.errors.push(result.error)
        continue
      }

      const attempts = await registerAttempt(operation)
      if (attempts >= MAX_ATTEMPTS) {
        await removeOperation(operation.operationId)
        summary.removed += 1
        summary.errors.push(result.error ?? 'Falha ao sincronizar.')
      } else {
        stop = true
        break
      }
    }
  }

  summary.pending = await pendingCount()
  if (
    summary.status !== 'offline' &&
    summary.status !== 'unauthorized' &&
    summary.status !== 'error'
  ) {
    summary.status = summary.pending > 0 ? 'partial' : 'ok'
  }

  notifyPending()
  return summary
}

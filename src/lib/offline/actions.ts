'use client'

import type { ActionResult } from '@/actions/types'
import { createOperationId, enqueueOperation } from './queue'
import type { OfflineOperationKind, OfflineOperationPayload } from './types'

/**
 * Executa a acao online ou, se nao houver rede, enfileira para `/api/sync`.
 *
 * O `operationId` e gerado **antes** da tentativa online e o mesmo usado na
 * fila: se o servidor gravar e a resposta se perder, o replay devolve o
 * resultado salvo em vez de repetir os efeitos.
 *
 * Padrao de uso (Fase 4):
 *   aplicar o otimista -> chamar submitOrQueue -> em erro de negocio, rollback.
 */
export type SubmitOrQueueOptions<T> = {
  kind: OfflineOperationKind
  payload: OfflineOperationPayload
  run: (operationId: string) => Promise<ActionResult<T>>
  /** Chamado apenas se o enfileiramento falhar (ex.: storage cheio). */
  rollback?: () => void
}

export type SubmitOrQueueResult<T> = ActionResult<T> & { queued?: boolean }

export function isOfflineError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true

  if (error instanceof TypeError) return true

  if (
    typeof DOMException !== 'undefined' &&
    error instanceof DOMException &&
    (error.name === 'AbortError' || error.name === 'NetworkError')
  ) {
    return true
  }

  const message =
    error instanceof Error ? error.message.toLowerCase() : ''

  return (
    message.includes('failed to fetch') ||
    message.includes('fetch failed') ||
    message.includes('networkerror') ||
    message.includes('network error') ||
    message.includes('load failed') ||
    message.includes('timeout')
  )
}

export async function submitOrQueue<T>({
  kind,
  payload,
  run,
  rollback,
}: SubmitOrQueueOptions<T>): Promise<SubmitOrQueueResult<T>> {
  const operationId = createOperationId()
  const offline = typeof navigator !== 'undefined' && !navigator.onLine

  if (!offline) {
    try {
      return await run(operationId)
    } catch (error) {
      if (!isOfflineError(error)) throw error
    }
  }

  try {
    await enqueueOperation(kind, payload, operationId)
    return {
      ok: true,
      queued: true,
      message: 'Salvo offline. Será enviado quando houver conexão.',
    }
  } catch {
    rollback?.()
    return {
      ok: false,
      queued: false,
      error: 'Não foi possível salvar a alteração no dispositivo.',
    }
  }
}

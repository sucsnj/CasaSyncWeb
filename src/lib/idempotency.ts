import type { ActionResult } from '@/actions/types'
import type { Json } from '@/types/database'
import { createAdminClient } from '@/utils/supabase/admin'

/**
 * Idempotencia de mutacoes disparadas pela fila offline (Fase 1).
 *
 * Sem `operationId`, o helper apenas executa a acao original — o comportamento
 * online continua exatamente igual. Com `operationId`, a primeira execucao
 * grava o `ActionResult` em `app_operations`; replays devolvem o mesmo
 * resultado sem reexecutar efeitos colaterais (pontos, notificacoes, push).
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Claim sem resultado por mais tempo que isso e considerado orfao (crash). */
const IN_PROGRESS_GRACE_MS = 60_000

const PURGE_EVERY = 50
const PURGE_AFTER_MS = 7 * 24 * 60 * 60 * 1000

let executionsSincePurge = 0

function parseStoredResult<T>(value: Json | null): ActionResult<T> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as { ok?: unknown }
  if (typeof candidate.ok !== 'boolean') return null
  return value as unknown as ActionResult<T>
}

export async function withIdempotency<T>(
  operationId: string | undefined,
  kind: string,
  run: () => Promise<ActionResult<T>>
): Promise<ActionResult<T>> {
  if (!operationId) return run()

  if (!UUID_PATTERN.test(operationId)) {
    return { ok: false, error: 'Identificador de operação inválido.' }
  }

  const admin = createAdminClient()

  const { error: claimError } = await admin
    .from('app_operations')
    .insert({ operation_id: operationId, kind })

  let isTakeover = false

  if (claimError) {
    if (claimError.code !== '23505') {
      console.error('[idempotency] falha ao reservar a operação:', claimError)
      return {
        ok: false,
        error: 'Não foi possível registrar a operação. Tente novamente.',
      }
    }

    const { data: existing } = await admin
      .from('app_operations')
      .select('result, created_at')
      .eq('operation_id', operationId)
      .maybeSingle()

    const stored = parseStoredResult<T>(existing?.result ?? null)
    if (stored) return stored

    const createdAt = existing?.created_at
      ? new Date(existing.created_at).getTime()
      : 0

    if (Date.now() - createdAt < IN_PROGRESS_GRACE_MS) {
      return {
        ok: false,
        code: 'IN_PROGRESS',
        error: 'Operação em andamento. Tente novamente em instantes.',
      }
    }

    // Claim orfao (execucao anterior morreu antes de gravar o resultado).
    const { data: claimed } = await admin
      .from('app_operations')
      .update({ created_at: new Date().toISOString() })
      .eq('operation_id', operationId)
      .is('result', null)
      .select('operation_id')

    if (!claimed || claimed.length === 0) {
      const { data: finished } = await admin
        .from('app_operations')
        .select('result')
        .eq('operation_id', operationId)
        .maybeSingle()

      const finishedResult = parseStoredResult<T>(finished?.result ?? null)
      if (finishedResult) return finishedResult

      return {
        ok: false,
        code: 'IN_PROGRESS',
        error: 'Operação em andamento. Tente novamente em instantes.',
      }
    }

    isTakeover = true
  }

  let result: ActionResult<T>
  try {
    result = await run()
  } catch (error) {
    await admin.from('app_operations').delete().eq('operation_id', operationId)
    throw error
  }

  if (!result.ok) {
    // Falha nao e memorizada: libera a chave para uma nova tentativa (o efeito
    // da acao so acontece depois das validacoes, entao reexecutar e seguro).
    await admin.from('app_operations').delete().eq('operation_id', operationId)
    return isTakeover ? { ...result, code: 'CONFLICT' } : result
  }

  const { error: storeError } = await admin
    .from('app_operations')
    .update({ result: result as unknown as Json })
    .eq('operation_id', operationId)

  if (storeError) {
    console.error('[idempotency] falha ao gravar o resultado:', storeError)
  }

  executionsSincePurge += 1
  if (executionsSincePurge >= PURGE_EVERY) {
    executionsSincePurge = 0
    void purgeOldOperations()
  }

  return result
}

async function purgeOldOperations(): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('app_operations')
    .delete()
    .lt('created_at', new Date(Date.now() - PURGE_AFTER_MS).toISOString())

  if (error) {
    console.error('[idempotency] falha ao limpar operações antigas:', error)
  }
}

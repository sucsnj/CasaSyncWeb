import { NextResponse } from 'next/server'
import { dispatchOfflineOperation } from '@/lib/offline/sync-dispatch'
import {
  isOfflineOperationKind,
  type SyncOperationInput,
  type SyncResultItem,
} from '@/lib/offline/types'
import { getSessionProfile } from '@/utils/house'

export const dynamic = 'force-dynamic'

const MAX_OPERATIONS = 20
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function jsonResponse(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

/**
 * Drena um lote da fila offline. A autenticacao e a autorizacao real ficam
 * nas Server Actions; aqui so validamos o formato e preservamos a ordem.
 */
export async function POST(request: Request) {
  const { user } = await getSessionProfile()

  if (!user) {
    return jsonResponse(
      { ok: false, error: 'Autenticação necessária.' },
      401
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonResponse({ ok: false, error: 'JSON inválido.' }, 400)
  }

  const ops = isRecord(body) ? body.ops : null
  if (!Array.isArray(ops) || ops.length === 0) {
    return jsonResponse(
      { ok: false, error: 'Nenhuma operação para sincronizar.' },
      400
    )
  }

  if (ops.length > MAX_OPERATIONS) {
    return jsonResponse(
      { ok: false, error: 'Lote acima do limite permitido.' },
      400
    )
  }

  const results: SyncResultItem[] = []

  for (const raw of ops) {
    const operationId =
      isRecord(raw) && typeof raw.operationId === 'string'
        ? raw.operationId
        : null

    if (!operationId || !UUID_PATTERN.test(operationId)) {
      results.push({
        operationId: operationId ?? '00000000-0000-0000-0000-000000000000',
        ok: false,
        code: 'INVALID',
        error: 'Identificador de operação inválido.',
      })
      continue
    }

    if (!isRecord(raw) || !isOfflineOperationKind(raw.kind)) {
      results.push({
        operationId,
        ok: false,
        code: 'INVALID',
        error: 'Operação não suportada.',
      })
      continue
    }

    const operation: SyncOperationInput = {
      operationId,
      kind: raw.kind,
      payload: isRecord(raw.payload) ? raw.payload : {},
    }

    try {
      const result = await dispatchOfflineOperation(operation)

      if (result.ok) {
        results.push({ operationId, ok: true, message: result.message })
        continue
      }

      const code =
        result.code === 'IN_PROGRESS' || result.code === 'CONFLICT'
          ? result.code
          : undefined

      results.push({ operationId, ok: false, code, error: result.error })
    } catch (error) {
      console.error('[sync] falha ao processar operação:', error)
      results.push({
        operationId,
        ok: false,
        error: 'Falha ao processar a operação.',
      })
    }
  }

  return jsonResponse({ ok: true, results }, 200)
}

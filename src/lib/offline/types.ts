/**
 * Tipos compartilhados entre o cliente offline (IndexedDB/outbox) e o endpoint
 * `/api/sync`. Nao importar nada de servidor aqui: este modulo tambem roda no
 * browser.
 */

export const OFFLINE_OPERATION_KINDS = [
  'task.complete',
  'task.request_extension',
  'task.approve',
  'task.reject',
  'task.not_delivered',
  'task.set_on_hold',
  'task.restore',
  'task.admin_complete',
  'task.resolve_extension',
  'reward.request_redemption',
  'reward.approve_redemption',
  'reward.reject_redemption',
  'reward.create_suggestion',
  'reward.resolve_suggestion',
] as const

export type OfflineOperationKind = (typeof OFFLINE_OPERATION_KINDS)[number]

export type OfflineOperationPayload = Record<string, unknown>

export type OfflineOperation = {
  operationId: string
  kind: OfflineOperationKind
  payload: OfflineOperationPayload
  /** ISO; a fila drena em ordem crescente. */
  createdAt: string
  attempts: number
}

export type SyncOperationInput = Pick<
  OfflineOperation,
  'operationId' | 'kind' | 'payload'
>

export type SyncResultCode = 'IN_PROGRESS' | 'CONFLICT' | 'INVALID'

export type SyncResultItem = {
  operationId: string
  ok: boolean
  code?: SyncResultCode
  error?: string
  message?: string
}

export type SyncResponse = {
  ok: boolean
  results?: SyncResultItem[]
  error?: string
}

export function isOfflineOperationKind(
  value: unknown
): value is OfflineOperationKind {
  return (
    typeof value === 'string' &&
    (OFFLINE_OPERATION_KINDS as readonly string[]).includes(value)
  )
}

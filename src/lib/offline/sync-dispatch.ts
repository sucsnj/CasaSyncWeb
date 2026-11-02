import {
  adminCompleteTask,
  approveTask,
  completeTask,
  markTaskNotDelivered,
  rejectCompletedTask,
  requestTaskExtension,
  resolveTaskExtension,
  restoreTask,
  setTaskOnHold,
} from '@/actions/tasks'
import {
  approveRedemption,
  createRewardSuggestion,
  rejectRedemption,
  requestRedemption,
  resolveRewardSuggestion,
} from '@/actions/rewards'
import type { ActionResult } from '@/actions/types'
import type { SyncOperationInput } from './types'

/**
 * Traduz uma operacao da fila offline para a Server Action correspondente.
 *
 * Server-only (importado apenas por `/api/sync`). Toda autorizacao/validacao
 * continua dentro da action — o endpoint nao confia no payload.
 */

type Payload = Record<string, unknown>

function invalid(error: string): ActionResult<unknown> {
  return { ok: false, code: 'CONFLICT', error }
}

function asRecord(value: unknown): Payload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Payload
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function asOptionalString(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return value
  return typeof value === 'string' ? value : undefined
}

function asOptionalNumber(value: unknown): number | null | undefined {
  if (value === undefined || value === null) return value
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined
}

export async function dispatchOfflineOperation(
  operation: SyncOperationInput
): Promise<ActionResult<unknown>> {
  const payload = asRecord(operation.payload)
  if (!payload) return invalid('Payload da operação inválido.')

  switch (operation.kind) {
    case 'task.complete': {
      const taskId = asString(payload.taskId)
      if (!taskId) return invalid('Tarefa inválida.')
      return completeTask(taskId, operation.operationId)
    }

    case 'task.request_extension': {
      const taskId = asString(payload.taskId)
      const reason = asString(payload.reason)
      if (!taskId || !reason) return invalid('Pedido de adiamento inválido.')
      return requestTaskExtension(taskId, reason, operation.operationId)
    }

    case 'task.approve': {
      const taskId = asString(payload.taskId)
      if (!taskId) return invalid('Tarefa inválida.')
      return approveTask(taskId, operation.operationId)
    }

    case 'task.reject': {
      const taskId = asString(payload.taskId)
      if (!taskId) return invalid('Tarefa inválida.')
      return rejectCompletedTask(taskId, operation.operationId)
    }

    case 'task.not_delivered': {
      const taskId = asString(payload.taskId)
      if (!taskId) return invalid('Tarefa inválida.')
      return markTaskNotDelivered(taskId, operation.operationId)
    }

    case 'task.set_on_hold': {
      const taskId = asString(payload.taskId)
      const onHold = asBoolean(payload.onHold)
      if (!taskId || onHold === null) return invalid('Tarefa inválida.')
      return setTaskOnHold(taskId, onHold, operation.operationId)
    }

    case 'task.restore': {
      const taskId = asString(payload.taskId)
      if (!taskId) return invalid('Tarefa inválida.')
      return restoreTask(taskId, operation.operationId)
    }

    case 'task.admin_complete': {
      const taskId = asString(payload.taskId)
      if (!taskId) return invalid('Tarefa inválida.')
      return adminCompleteTask(taskId, operation.operationId)
    }

    case 'task.resolve_extension': {
      const taskId = asString(payload.taskId)
      const approve = asBoolean(payload.approve)
      const days = asOptionalNumber(payload.days)
      if (!taskId || approve === null || days === undefined) {
        return invalid('Resolução de adiamento inválida.')
      }
      return resolveTaskExtension(
        taskId,
        approve,
        days ?? 3,
        operation.operationId
      )
    }

    case 'reward.request_redemption': {
      const rewardId = asString(payload.rewardId)
      if (!rewardId) return invalid('Recompensa inválida.')
      return requestRedemption(rewardId, operation.operationId)
    }

    case 'reward.approve_redemption': {
      const redemptionId = asString(payload.redemptionId)
      if (!redemptionId) return invalid('Resgate inválido.')
      return approveRedemption(redemptionId, operation.operationId)
    }

    case 'reward.reject_redemption': {
      const redemptionId = asString(payload.redemptionId)
      if (!redemptionId) return invalid('Resgate inválido.')
      return rejectRedemption(redemptionId, operation.operationId)
    }

    case 'reward.create_suggestion': {
      const title = asString(payload.title)
      if (!title) return invalid('Sugestão inválida.')

      const description = asOptionalString(payload.description)
      const pointsCost = asOptionalNumber(payload.pointsCost)
      const imageUrl = asOptionalString(payload.imageUrl)
      if (
        description === undefined ||
        pointsCost === undefined ||
        imageUrl === undefined
      ) {
        return invalid('Sugestão inválida.')
      }

      return createRewardSuggestion(
        { title, description, pointsCost, imageUrl },
        operation.operationId
      )
    }

    case 'reward.resolve_suggestion': {
      const suggestionId = asString(payload.suggestionId)
      const approve = asBoolean(payload.approve)
      if (!suggestionId || approve === null) {
        return invalid('Sugestão inválida.')
      }
      return resolveRewardSuggestion(
        suggestionId,
        approve,
        operation.operationId
      )
    }

    default:
      return invalid('Operação não suportada.')
  }
}

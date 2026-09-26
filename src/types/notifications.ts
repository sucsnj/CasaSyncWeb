import type { Tables } from '@/types/database'

export type NotificationRow = Tables<'notifications'>

/**
 * Tipos de evento que geram notificação. Valores gravados em
 * `notifications.type` (texto + check no banco). O destinatário é sempre
 * "o outro lado" da ação: o dependente para ações do ADMIN e todos os ADMINs
 * membros para ações do dependente.
 */
export type NotificationType =
  | 'TASK_CREATED'
  | 'TASK_COMPLETED'
  | 'TASK_APPROVED'
  | 'TASK_REJECTED'
  | 'TASK_NOT_DELIVERED'
  | 'TASK_RESTORED'
  | 'EXTENSION_REQUESTED'
  | 'EXTENSION_APPROVED'
  | 'EXTENSION_REJECTED'
  | 'REWARD_CREATED'
  | 'REDEMPTION_REQUESTED'
  | 'REDEMPTION_APPROVED'
  | 'REDEMPTION_REJECTED'
  | 'SUGGESTION_CREATED'
  | 'SUGGESTION_APPROVED'
  | 'SUGGESTION_REJECTED'
  | 'QUICK_MESSAGE'
  | 'PENALTY'
  | 'COMUNICADO_PUBLISHED'

export type NotificationItem = {
  id: string
  house_id: string
  recipient_id: string
  actor_id: string | null
  type: NotificationType
  title: string
  body: string
  link: string | null
  image_url: string | null
  message_id: string | null
  read_at: string | null
  created_at: string
}
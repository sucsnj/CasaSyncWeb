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
  | 'TASK_ON_HOLD'
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
  | 'ACHIEVEMENT_UNLOCKED'

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

/**
 * Categorias que a casa pode silenciar (chave `notification_mute`).
 * `null` = NOTIFICAÇÃO SEM CATEGORIA, ou seja **nunca** silenciável.
 *
 * `QUICK_MESSAGE` e `PENALTY` ficam fora de propósito: a mensagem rápida é o
 * canal direto do dependente para o tutor, e a penalidade é aviso de um débito
 * real de pontos (que já exige motivo). Silenciar os dois é o tipo de mute que
 * vira briga em casa — então não existe caminho no código para desligá-los.
 */
export type NotificationCategory = 'tasks' | 'rewards' | 'achievements'

export const MUTEABLE_CATEGORIES: NotificationCategory[] = [
  'tasks',
  'rewards',
  'achievements',
]

const CATEGORY_BY_TYPE: Record<NotificationType, NotificationCategory | null> = {
  // Tarefas (ciclo de vida) + pedidos/resoluções de adiamento.
  TASK_CREATED: 'tasks',
  TASK_COMPLETED: 'tasks',
  TASK_APPROVED: 'tasks',
  TASK_REJECTED: 'tasks',
  TASK_NOT_DELIVERED: 'tasks',
  TASK_ON_HOLD: 'tasks',
  TASK_RESTORED: 'tasks',
  EXTENSION_REQUESTED: 'tasks',
  EXTENSION_APPROVED: 'tasks',
  EXTENSION_REJECTED: 'tasks',
  // Recompensas: catálogo, resgates e sugestões.
  REWARD_CREATED: 'rewards',
  REDEMPTION_REQUESTED: 'rewards',
  REDEMPTION_APPROVED: 'rewards',
  REDEMPTION_REJECTED: 'rewards',
  SUGGESTION_CREATED: 'rewards',
  SUGGESTION_APPROVED: 'rewards',
  SUGGESTION_REJECTED: 'rewards',
  // Conquistas.
  ACHIEVEMENT_UNLOCKED: 'achievements',
  // Nunca silenciáveis.
  QUICK_MESSAGE: null,
  PENALTY: null,
}

/**
 * Categoria silenciável de um tipo de notificação, ou `null` quando não há
 * mute para ela. **Fonte única** do agrupamento: o toggle do card
 * "Notificações" e a guarda em `notifyUser`/`notifyHouse` leem daqui, então não
 * há como um lado conhecer uma categoria e o outro não.
 */
export function notificationCategory(
  type: NotificationType
): NotificationCategory | null {
  return CATEGORY_BY_TYPE[type] ?? null
}
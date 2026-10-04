import { notificationCategory } from '@/types/notifications'
import type { NotificationCategory, NotificationType } from '@/types/notifications'
import type { NotificationMuteSettings } from './settings'

/**
 * A casa silenciou esta notificação?
 *
 * Falha em favor de **notificar** (fail open): categoria desconhecida, mute sem
 * a chave da casa ou tipo sem categoria (`QUICK_MESSAGE`, `PENALTY`) ⇒ `false`,
 * ou seja, o evento é entregue. Silenciar é uma escolha do ADMIN sobre a casa
 * dele, nunca algo que possa impedir um aviso obrigatório.
 */
export function isNotificationMuted(
  type: NotificationType,
  mute: NotificationMuteSettings | null | undefined
): boolean {
  if (!mute) return false
  const category: NotificationCategory | null = notificationCategory(type)
  if (!category) return false
  return mute[category] === true
}
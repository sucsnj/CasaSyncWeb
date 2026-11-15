'use server'

import { getSessionProfile } from '@/utils/house'
import { getMyNotifications } from '@/utils/notifications'
import type { NotificationRow } from '@/types/notifications'

/** Sino do cabeçalho: lista do usuário da sessão, mais recente primeiro. */
export async function listMyNotifications(): Promise<NotificationRow[]> {
  const { user } = await getSessionProfile()
  if (!user) throw new Error('UNAUTHENTICATED')
  return getMyNotifications(user.id)
}

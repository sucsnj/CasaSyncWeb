'use server'

import { createAdminClient } from '@/utils/supabase/admin'
import { getSessionProfile } from '@/utils/house'
import { cleanupReadNotifications } from '@/utils/notifications'
import type { ActionResult } from './types'

/**
 * Marca uma notificação do próprio usuário como lida.
 * O escopo (`recipient_id = user.id`) é sempre derivado da sessão.
 */
export async function markNotificationRead(
  notificationId: string
): Promise<ActionResult> {
  const { user } = await getSessionProfile()
  if (!user) return { ok: false, error: 'Autenticação necessária.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('recipient_id', user.id)
    .is('read_at', null)

  if (error) return { ok: false, error: 'Falha ao marcar como lida.' }

  return { ok: true }
}

/** Marca todas as notificações não lidas do usuário como lidas. */
export async function markAllNotificationsRead(): Promise<ActionResult> {
  const { user } = await getSessionProfile()
  if (!user) return { ok: false, error: 'Autenticação necessária.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_id', user.id)
    .is('read_at', null)

  if (error) return { ok: false, error: 'Falha ao marcar as notificações.' }

  return { ok: true }
}

/** Apaga uma notificação do próprio usuário. */
export async function deleteNotification(
  notificationId: string
): Promise<ActionResult> {
  const { user } = await getSessionProfile()
  if (!user) return { ok: false, error: 'Autenticação necessária.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('notifications')
    .delete()
    .eq('id', notificationId)
    .eq('recipient_id', user.id)

  if (error) return { ok: false, error: 'Falha ao apagar a notificação.' }

  return { ok: true }
}

/** Apaga todas as notificações do próprio usuário. */
export async function deleteAllNotifications(): Promise<ActionResult> {
  const { user } = await getSessionProfile()
  if (!user) return { ok: false, error: 'Autenticação necessária.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('notifications')
    .delete()
    .eq('recipient_id', user.id)

  if (error) return { ok: false, error: 'Falha ao apagar as notificações.' }

  return { ok: true }
}

/**
 * Limpeza manual das lidas com mais de 5 dias (além da limpeza lazy feita no
 * carregamento). Útil para o sino disparar em cenários de página muito longa.
 */
export async function purgeReadNotifications(): Promise<ActionResult> {
  const { user } = await getSessionProfile()
  if (!user) return { ok: false, error: 'Autenticação necessária.' }

  const admin = createAdminClient()
  await cleanupReadNotifications(admin, user.id)

  return { ok: true }
}

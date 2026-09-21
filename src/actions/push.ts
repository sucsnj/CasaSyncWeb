'use server'

import { createAdminClient } from '@/utils/supabase/admin'
import { getSessionProfile } from '@/utils/house'
import type { ActionResult } from './types'
import {
  getPushTable,
  sendPushNotification,
  type PushPayload,
} from '@/lib/push-service'

/**
 * Registra a push subscription do usuário autenticado.
 * A linha antiga do mesmo endpoint é removida antes do insert (não depende de
 * constraint única em `(user_id, endpoint)`).
 */
export async function registerPushSubscription(
  endpoint: string,
  p256dh: string,
  auth: string,
  userAgent?: string
): Promise<ActionResult> {
  const { user, profile } = await getSessionProfile()
  if (!user) return { ok: false, error: 'Autenticação necessária.' }

  const house = await (async () => {
    if (profile?.user_role === 'ADMIN') {
      const { getActiveAdminHouse } = await import('@/utils/house')
      return getActiveAdminHouse()
    } else {
      const { getDependentHouse } = await import('@/utils/house')
      return getDependentHouse(user.id)
    }
  })()

  if (!house) return { ok: false, error: 'Você ainda não está vinculado a uma casa.' }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return { ok: false, error: 'Configuração do servidor indisponível.' }
  }

  // Remove qualquer subscription antiga deste endpoint antes de gravar a nova.
  // Evita depender de constraint única em `push_subscriptions` (o upsert com
  // onConflict: 'user_id,endpoint' falhava porque o schema não tem essa
  // constraint — sem ela o Postgres rejeita o ON CONFLICT e a subscription
  // nunca era registrada, matando o push silenciosamente).
  await getPushTable(admin)
    .delete()
    .eq('user_id', user.id)
    .eq('endpoint', endpoint)

  const { error } = await getPushTable(admin).insert({
    user_id: user.id,
    house_id: house.id,
    endpoint,
    p256dh,
    auth,
    user_agent: userAgent ?? null,
  })

  if (error) {
    console.error('Push subscription register error:', error)
    return { ok: false, error: 'Falha ao registrar subscription.' }
  }

  return { ok: true }
}

/**
 * Remove uma push subscription específica do usuário (logout, revogação).
 */
export async function unregisterPushSubscription(endpoint: string): Promise<ActionResult> {
  const { user } = await getSessionProfile()
  if (!user) return { ok: false, error: 'Autenticação necessária.' }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return { ok: false, error: 'Configuração do servidor indisponível.' }
  }

  const { error } = await getPushTable(admin)
    .delete()
    .eq('user_id', user.id)
    .eq('endpoint', endpoint)

  if (error) return { ok: false, error: 'Falha ao remover subscription.' }

  return { ok: true }
}

/**
 * Remove TODAS as push subscriptions do usuário (logout total).
 */
export async function unregisterAllPushSubscriptions(): Promise<ActionResult> {
  const { user } = await getSessionProfile()
  if (!user) return { ok: false, error: 'Autenticação necessária.' }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return { ok: false, error: 'Configuração do servidor indisponível.' }
  }

  const { error } = await getPushTable(admin)
    .delete()
    .eq('user_id', user.id)

  if (error) return { ok: false, error: 'Falha ao remover subscriptions.' }

  return { ok: true }
}

/**
 * Envia push notification para TODOS os dispositivos de um usuário.
 * Usado internamente pelas actions que geram notificações.
 * Delega ao `push-service` (validação de VAPID + envio multi-dispositivo
 * com Promise.allSettled + limpeza de endpoints 404/410).
 */
export async function sendPushToUser(
  targetUserId: string,
  payload: PushPayload
): Promise<{ sent: number; failed: number }> {
  return sendPushNotification(targetUserId, payload)
}

/**
 * Envia push notification para TODOS os ADMINs de uma casa, opcionalmente
 * excluindo quem agiu (mesma semântica de `notifyHouse` no banco).
 */
export async function sendPushToHouseAdmins(
  houseId: string,
  payload: Parameters<typeof sendPushToUser>[1],
  excludeUserId?: string
): Promise<{ sent: number; failed: number }> {
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return { sent: 0, failed: 0 }
  }

  // Busca todos os ADMINs membros da casa
  const { data: adminMembers } = await admin
    .from('house_members')
    .select('profile_id')
    .eq('house_id', houseId)
    .eq('role', 'ADMIN')

  if (!adminMembers || adminMembers.length === 0) {
    return { sent: 0, failed: 0 }
  }

  let totalSent = 0
  let totalFailed = 0

  for (const member of adminMembers) {
    if (member.profile_id === excludeUserId) continue
    const result = await sendPushToUser(member.profile_id, payload)
    totalSent += result.sent
    totalFailed += result.failed
  }

  return { sent: totalSent, failed: totalFailed }
}

/**
 * Envia push notification para TODOS os DEPENDENTES de uma casa, opcionalmente
 * excluindo quem agiu.
 */
export async function sendPushToHouseDependents(
  houseId: string,
  payload: Parameters<typeof sendPushToUser>[1],
  excludeUserId?: string
): Promise<{ sent: number; failed: number }> {
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return { sent: 0, failed: 0 }
  }

  const { data: dependentMembers } = await admin
    .from('house_members')
    .select('profile_id')
    .eq('house_id', houseId)
    .eq('role', 'DEPENDENT')

  if (!dependentMembers || dependentMembers.length === 0) {
    return { sent: 0, failed: 0 }
  }

  let totalSent = 0
  let totalFailed = 0

  for (const member of dependentMembers) {
    if (member.profile_id === excludeUserId) continue
    const result = await sendPushToUser(member.profile_id, payload)
    totalSent += result.sent
    totalFailed += result.failed
  }

  return { sent: totalSent, failed: totalFailed }
}
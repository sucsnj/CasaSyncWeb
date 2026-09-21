'use server'

import { createAdminClient } from '@/utils/supabase/admin'
import { getSessionProfile } from '@/utils/house'
import type { ActionResult } from './types'
import webPush from 'web-push'

// Configura web-push com as chaves VAPID
function initWebPush() {
  webPush.setVapidDetails(
    'mailto:casasync@example.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  )
}

type PushSubscriptionRow = {
  endpoint: string
  p256dh: string
  auth: string
  user_id: string
  house_id: string
}

const PUSH_TABLE = 'push_subscriptions' as const

function getPushTable(admin: ReturnType<typeof createAdminClient>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (admin as any).from(PUSH_TABLE)
}

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
 */
export async function sendPushToUser(
  targetUserId: string,
  payload: {
    title: string
    body: string
    icon?: string
    badge?: string
    tag?: string
    data?: Record<string, unknown>
    actions?: Array<{ action: string; title: string }>
  }
): Promise<{ sent: number; failed: number }> {
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return { sent: 0, failed: 0 }
  }

  initWebPush()

  const { data: subscriptions } = await getPushTable(admin)
    .select('endpoint, p256dh, auth')
    .eq('user_id', targetUserId)

  const subs = (subscriptions ?? []) as PushSubscriptionRow[]

  if (!subs.length) {
    console.warn(
      `[push] sendPushToUser: nenhuma subscription registrada para o usuário ${targetUserId}`
    )
    return { sent: 0, failed: 0 }
  }

  let sent = 0
  let failed = 0

  for (const sub of subs) {
    try {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      }

      await webPush.sendNotification(pushSubscription, JSON.stringify(payload))
      sent++
    } catch (err: unknown) {
      failed++
      // Se a subscription expirou/foi revogada (410 Gone), remove do banco
      if (err instanceof webPush.WebPushError && err.statusCode === 410) {
        await getPushTable(admin).delete().eq('endpoint', sub.endpoint)
      }
      console.error('Push send error:', err)
    }
  }

  return { sent, failed }
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

  initWebPush()

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

  initWebPush()

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
import webPush from 'web-push'
import { createAdminClient } from '@/utils/supabase/admin'

export type PushPayload = {
  title: string
  body: string
  icon?: string
  badge?: string
  tag?: string
  data?: Record<string, unknown>
  actions?: Array<{ action: string; title: string }>
}

type PushResult = { sent: number; failed: number }

type PushSubscriptionRow = {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

export const PUSH_TABLE = 'push_subscriptions' as const

const PUSH_TABLE_SELECT = 'id, endpoint, p256dh, auth' as const

const DEFAULT_VAPID_SUBJECT = 'mailto:casasync@example.com'

export function getPushTable(admin: ReturnType<typeof createAdminClient>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (admin as any).from(PUSH_TABLE)
}

/**
 * Configura o web-push com as chaves VAPID. Valida as env vars e loga
 * claramente quando algo falta — push fica desabilitado em vez de falhar
 * silenciosamente.
 */
export function initWebPush(): boolean {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT?.trim() || DEFAULT_VAPID_SUBJECT

  if (!publicKey || !privateKey) {
    console.error(
      '[push] Chaves VAPID ausentes no process.env — push NÃO será enviado. ' +
        `NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey ? 'ok' : 'FALTANDO'}, ` +
        `VAPID_PRIVATE_KEY=${privateKey ? 'ok' : 'FALTANDO'}, ` +
        `VAPID_SUBJECT=${process.env.VAPID_SUBJECT?.trim() || 'não definida (usando fallback)'}`
    )
    return false
  }

  if (!process.env.VAPID_SUBJECT?.trim()) {
    console.warn(
      `[push] VAPID_SUBJECT não definida no process.env; usando fallback ${DEFAULT_VAPID_SUBJECT}`
    )
  }

  webPush.setVapidDetails(subject, publicKey, privateKey)
  return true
}

/**
 * Envia push para TODOS os dispositivos do usuário (uma row por device).
 * Usa Promise.allSettled para nunca deixar um dispositivo rejeitar os demais,
 * e remove do banco subscriptions mortas (404/410 Gone) automaticamente.
 */
export async function sendPushNotification(
  targetUserId: string,
  payload: PushPayload
): Promise<PushResult> {
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return { sent: 0, failed: 0 }
  }

  if (!initWebPush()) return { sent: 0, failed: 0 }

  const { data: subscriptions } = await getPushTable(admin)
    .select(PUSH_TABLE_SELECT)
    .eq('user_id', targetUserId)

  const subs = (subscriptions ?? []) as PushSubscriptionRow[]

  if (!subs.length) {
    console.warn(`[push] Nenhuma subscription registrada para o usuário ${targetUserId}`)
    return { sent: 0, failed: 0 }
  }

  const payloadString = JSON.stringify(payload)

  const results = await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webPush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payloadString
        )
        return { ok: true as const }
      } catch (err) {
        // 404/410 = subscription morta (unsubscribed/expirada): remove do banco
        if (err instanceof webPush.WebPushError && (err.statusCode === 404 || err.statusCode === 410)) {
          const { error } = await getPushTable(admin).delete().eq('id', sub.id)
          if (error) {
            console.error('[push] Erro ao remover subscription expirada:', error)
          } else {
            console.warn(`[push] Subscription "${sub.endpoint}" removida (status ${err.statusCode})`)
          }
        } else {
          console.error('[push] sendNotification error:', err)
        }
        return { ok: false as const }
      }
    })
  )

  let sent = 0
  let failed = 0
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.ok) sent++
    else failed++
  }

  return { sent, failed }
}
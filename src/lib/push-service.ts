import webPush from 'web-push'
import { createAdminClient } from '@/utils/supabase/admin'
import { getApps, initializeApp, cert } from 'firebase-admin/app'
import { getMessaging } from 'firebase-admin/messaging'

function initFirebaseAdmin() {
  if (getApps().length) return
  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!projectId || !clientEmail || !privateKey) {
    console.error('[PUSH] Firebase Admin não configurado — push nativo desabilitado.')
    return
  }
  initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  })
}

export type PushPayload = {
  title: string
  body: string
  url?: string
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
  p256dh: string | null
  auth: string | null
  provider: string | null
  token: string | null
}

export const PUSH_TABLE = 'push_subscriptions' as const

const PUSH_TABLE_SELECT = 'id, endpoint, p256dh, auth, provider, token' as const

const DEFAULT_VAPID_SUBJECT = 'mailto:casasync@example.com'

function endpointPreview(endpoint: string): string {
  return `${endpoint.slice(0, 30)}...`
}

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
 * Monta a string JSON que vai no corpo do push, garantindo que contenha
 * obrigatoriamente `{ title, body, url }`. O `url` de destino é resolvido do
 * campo top-level ou de `data.url` (retrocompatível com os chamadores atuais).
 */
function buildPayloadString(payload: PushPayload): string {
  const dataUrl = typeof payload.data?.url === 'string' ? payload.data.url : undefined
  const url = payload.url ?? dataUrl ?? '/'

  return JSON.stringify({
    title: payload.title ?? 'CasaSync',
    body: payload.body ?? '',
    url,
    icon: payload.icon ?? '/icons/icon-192.png',
    badge: payload.badge ?? '/icons/icon-192.png',
    tag: payload.tag,
    data: payload.data ?? { url },
    actions: payload.actions ?? [],
  })
}

/**
 * Envia push para TODOS os dispositivos do usuário (uma row por device).
 *
 * Isolamento por subscription: cada envio roda dentro de `Promise.allSettled`
 * — a falha em um token (ex.: único dispositivo com erro) NUNCA interrompe o
 * envio aos demais nem rejeita o grupo inteiro. O status HTTP de cada resposta
 * é logado explicitamente (útil para depurar entregas Android via FCM/Mozilla).
 *
 * Endpoints 404/410 (subscription morta/revogada/expirada) são removidos da
 * tabela automaticamente (por `id`).
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
    console.warn(`[PUSH] Nenhuma subscription registrada para o usuário ${targetUserId}`)
    return { sent: 0, failed: 0 }
  }

  const payloadString = buildPayloadString(payload)

  const results = await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        if (sub.provider === 'FCM_NATIVE' && sub.token) {
          initFirebaseAdmin()
          const apps = getApps()
          if (!apps.length) {
            return { ok: false as const, report: '[PUSH ERROR] Firebase Admin not configured' }
          }
          try {
            const messageId = await getMessaging().send({
              token: sub.token,
              notification: {
                title: JSON.parse(payloadString).title,
                body: JSON.parse(payloadString).body,
              },
              data: JSON.parse(payloadString).data ?? {},
            })
            console.log(`[PUSH SUCCESS] FCM ${targetUserId} | MessageId: ${messageId}`)
            return { ok: true as const, report: '[PUSH SUCCESS] 200' }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            console.error(`[PUSH ERROR] FCM ${targetUserId} | ${message}`)
            return { ok: false as const, report: `[PUSH ERROR] ${message}` }
          }
        }

        const result = await webPush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh ?? '', auth: sub.auth ?? '' },
          },
          payloadString
        )
        console.log(
          `[PUSH SUCCESS] User ${targetUserId} | Status: ${result.statusCode} | ` +
            `Endpoint: ${endpointPreview(sub.endpoint)}`
        )
        return { ok: true as const, report: `[PUSH SUCCESS] ${result.statusCode}` }
      } catch (err) {
        const statusCode =
          err instanceof webPush.WebPushError ? err.statusCode : undefined
        // O corpo da resposta é o que diz o MOTIVO (o `message` do web-push é
        // genérico: 'Received unexpected response code' para qualquer status não
        // 2xx). Sem ele, um 403 do FCM é indistinguível de uma assinatura VAPID
        // inválida, de uma payload rejeitada ou de uma subscription obsoleta.
        const body = err instanceof webPush.WebPushError ? err.body : undefined
        console.error(
          `[PUSH ERROR] User ${targetUserId} | Endpoint: ${endpointPreview(sub.endpoint)} | ` +
            `Status: ${statusCode ?? 'N/A'} | Message: ${err instanceof Error ? err.message : String(err)}` +
            (body ? ` | Body: ${body.slice(0, 300)}` : '')
        )

        // 404/410 = subscription inválida/expirada: remove do banco
        if (statusCode === 404 || statusCode === 410) {
          const { error } = await getPushTable(admin).delete().eq('id', sub.id)
          if (error) {
            console.error(
              `[PUSH CLEANUP] Falha ao remover subscription ${sub.id}: ${error.message}`
            )
          } else {
            console.log(`[PUSH CLEANUP] Removida assinatura expirada id: ${sub.id}`)
          }
        }

        return { ok: false as const, report: `[PUSH ERROR] ${statusCode ?? 'N/A'}` }
      }
    })
  )

  let sent = 0
  let failed = 0
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.ok) sent++
    else failed++
  }

  console.log(
    `[PUSH] Resumo do envio para o usuário ${targetUserId}: ` +
      `${sent} entregue(s), ${failed} falha(s) de ${subs.length} dispositivo(s)`
  )

  return { sent, failed }
}
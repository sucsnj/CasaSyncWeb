import { createAdminClient } from '@/utils/supabase/admin'
import { MEDIA_BUCKET } from '@/utils/media'
import { QUICK_MESSAGE_CAPACITY } from '@/utils/quick-message'
import {
  sendPushToUser,
  sendPushToHouseAdmins,
  sendPushToHouseDependents,
} from '@/actions/push'
import type { NotificationRow, NotificationType } from '@/types/notifications'

type AdminClient = ReturnType<typeof createAdminClient>

/** Notificações lidas são apagadas automaticamente após 5 dias. */
export const READ_RETENTION_DAYS = 5

const RETENTION_MS = READ_RETENTION_DAYS * 24 * 60 * 60 * 1000

export type NotifyInput = {
  houseId: string
  actorId: string
  type: NotificationType
  title: string
  body: string
  link?: string | null
  imageUrl?: string | null
  messageId?: string | null
}

export type NotifyHouseInput = NotifyInput & {
  side: 'ADMINS' | 'DEPENDENTS'
  /** Nunca notificar quem agiu. */
  excludeUserId?: string
}

export type PushPayloadInput = NotifyInput & {
  recipientId?: string
}

/**
 * Monta o payload do Web Push a partir dos mesmos dados da notificação interna.
 * Compartilhado por `notifyUser`/`notifyHouse` (disparo automático) e pelas
 * Server Actions que disparam o push explicitamente (padrão `dispatchPush: false`).
 */
export function toPushPayload(input: NotifyInput) {
  return {
    title: input.title,
    body: input.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: `casasync-${input.type.toLowerCase()}`,
    data: { url: input.link ?? '/', notifType: input.type, ...input },
    actions: input.link ? [{ action: 'open', title: 'Abrir' }] : [],
  }
}

export type NotifyOptions = {
  /** Se `false`, grava apenas a linha interna e NÃO dispara o push (quem chama assume o push). */
  dispatchPush?: boolean
}

/** Ids dos membros da casa com o papel informado. */
async function getHouseMemberIds(
  admin: AdminClient,
  houseId: string,
  role: 'ADMIN' | 'DEPENDENT'
): Promise<string[]> {
  const { data, error } = await admin
    .from('house_members')
    .select('profile_id')
    .eq('house_id', houseId)
    .eq('role', role)

  if (error) {
    console.error('[getHouseMemberIds] Query error:', error)
    return []
  }

  const ids = (data ?? []).map((member) => member.profile_id)
  console.log('[getHouseMemberIds] House:', houseId, 'Role:', role, 'IDs:', ids)
  return ids
}

/**
 * Cria uma notificação para um destinatário específico + envia push.
 *
 * Best-effort: a notificação é efeito secundário do fluxo de negócio — uma
 * falha ao gravá-la NUNCA deve derrubar a ação principal (crédito de pontos,
 * aprovação etc.).
 */
export async function notifyUser(
  admin: AdminClient,
  input: NotifyInput & { recipientId: string },
  options?: NotifyOptions
): Promise<void> {
  try {
    await admin.from('notifications').insert({
      house_id: input.houseId,
      recipient_id: input.recipientId,
      actor_id: input.actorId,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link ?? null,
      image_url: input.imageUrl ?? null,
      message_id: input.messageId ?? null,
    })
  } catch (err) {
    console.error('[notifications] Erro ao inserir notificação interna:', err)
  }

  // Envia push notification (não bloqueia, best-effort)
  if (options?.dispatchPush === false) return
  try {
    await sendPushToUser(input.recipientId, toPushPayload(input))
    console.log(`[PUSH] notifyUser: push disparado para o usuário ${input.recipientId}`)
  } catch (err) {
    console.error('[PUSH] Erro ao disparar push via notifyUser:', err)
  }
}

/**
 * Notifica "o outro lado" da ação dentro da casa: todos os ADMINs quando quem
 * agiu foi o dependente, ou todos os DEPENDENTEs quando quem agiu foi o ADMIN.
 * Quem agiu é sempre excluído. Best-effort (ver `notifyUser`).
 */
export async function notifyHouse(
  admin: AdminClient,
  input: NotifyHouseInput,
  options?: NotifyOptions
): Promise<void> {
  try {
    const ids = await getHouseMemberIds(
      admin,
      input.houseId,
      input.side === 'ADMINS' ? 'ADMIN' : 'DEPENDENT'
    )

    console.log('[notifyHouse] House ID:', input.houseId, 'Side:', input.side, 'Actor:', input.actorId, 'Found member IDs:', ids)

    const recipients = ids.filter((id) => id !== input.excludeUserId)
    console.log('[notifyHouse] Recipients after exclude:', recipients)
    if (recipients.length === 0) return

    const { error } = await admin.from('notifications').insert(
      recipients.map((recipientId) => ({
        house_id: input.houseId,
        recipient_id: recipientId,
        actor_id: input.actorId,
        type: input.type,
        title: input.title,
        body: input.body,
        link: input.link ?? null,
        image_url: input.imageUrl ?? null,
        message_id: input.messageId ?? null,
      }))
    )
    if (error) {
      console.error('[notifyHouse] Insert error:', error)
    } else {
      console.log('[notifyHouse] Inserted successfully for', recipients.length, 'recipients')
    }
  } catch (err) {
    console.error('[notifyHouse] Unexpected error:', err)
  }

  // Envia push notifications (não bloqueia, best-effort)
  if (options?.dispatchPush === false) return
  try {
    if (input.side === 'ADMINS') {
      await sendPushToHouseAdmins(input.houseId, toPushPayload(input), input.excludeUserId)
    } else {
      await sendPushToHouseDependents(input.houseId, toPushPayload(input), input.excludeUserId)
    }
    console.log('[PUSH] notifyHouse: push disparado para os', input.side.toLowerCase(), 'da casa', input.houseId)
  } catch (err) {
    console.error('[PUSH] Erro ao disparar push via notifyHouse:', err)
  }
}

/**
 * Apaga as notificações lidas do usuário com mais de 5 dias. Executado
 * "lazy" a cada carregamento — sem depender de pg_cron.
 */
export async function cleanupReadNotifications(
  admin: AdminClient,
  recipientId: string
): Promise<void> {
  const cutoff = new Date(Date.now() - RETENTION_MS).toISOString()

  await admin
    .from('notifications')
    .delete()
    .eq('recipient_id', recipientId)
    .not('read_at', 'is', null)
    .lt('read_at', cutoff)
}

/**
 * Notificações do usuário (mais recentes primeiro) + limpeza lazy das lidas
 * antigas. Lida com service-role porque o sino é renderizado no servidor e o
 * escopo é sempre o próprio usuário da sessão.
 */
export async function getMyNotifications(
  userId: string,
  limit = 50
): Promise<NotificationRow[]> {
  const admin = createAdminClient()

  try {
    await cleanupReadNotifications(admin, userId)
  } catch {
    // Best-effort: falha na limpeza não impede a listagem.
  }

  const { data } = await admin
    .from('notifications')
    .select('*')
    .eq('recipient_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  return data ?? []
}

/**
 * Extrai o caminho de um arquivo dentro do bucket a partir da URL pública.
 * Retorna `null` se a URL não parece ser do bucket ou for inválida.
 */
function storagePathFromPublicUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    const prefix = `/storage/v1/object/public/${MEDIA_BUCKET}/`
    const start = parsed.pathname.indexOf(prefix)
    if (start < 0) return null
    const path = parsed.pathname.slice(start + prefix.length)
    return path || null
  } catch {
    return null
  }
}

/**
 * Regra de retenção da "mensagem rápida": quando o dependente atinge 2
 * mensagens próprias JÁ lidas, apaga a mais antiga (todas as cópias que os
 * ADMINs receberam + o arquivo de imagem no storage — best-effort).
 *
 * Conta MENSAGENS (`message_id`), não cópias por destinatário. Disparado ao
 * marcar uma QUICK_MESSAGE como lida.
 */
export async function cleanupQuickMessages(
  admin: AdminClient,
  houseId: string,
  actorId: string
): Promise<void> {
  const { data } = await admin
    .from('notifications')
    .select('recipient_id, message_id, created_at, image_url, read_at')
    .eq('house_id', houseId)
    .eq('actor_id', actorId)
    .eq('type', 'QUICK_MESSAGE')
    .not('message_id', 'is', null)

  if (!data || data.length === 0) return

  const byMessage = new Map<
    string,
    { created: number; image_url: string | null; read: boolean }
  >()

  for (const row of data) {
    const messageId = row.message_id
    if (!messageId) continue
    const current = byMessage.get(messageId)
    const created = new Date(row.created_at).getTime()
    // A cópia do próprio remetente é apenas comprovante — só o destinatário
    // (outro membro, ex.: ADMIN) que abriu conta como "lida" na retenção.
    const isSenderCopy = row.recipient_id === actorId
    byMessage.set(messageId, {
      created: current ? Math.min(current.created, created) : created,
      image_url: current ? current.image_url : row.image_url,
      read: current
        ? current.read || (!isSenderCopy && row.read_at !== null)
        : !isSenderCopy && row.read_at !== null,
    })
  }

  const readMessages = [...byMessage.entries()].filter(
    ([, message]) => message.read
  )
  if (readMessages.length < QUICK_MESSAGE_CAPACITY) return

  readMessages.sort((a, b) => a[1].created - b[1].created)
  const [oldestId, oldest] = readMessages[0]

  await admin
    .from('notifications')
    .delete()
    .eq('house_id', houseId)
    .eq('actor_id', actorId)
    .eq('message_id', oldestId)

  if (oldest.image_url) {
    const path = storagePathFromPublicUrl(oldest.image_url)
    if (path) {
      try {
        await admin.storage.from(MEDIA_BUCKET).remove([path])
      } catch {
        // Best-effort: sobra de imagem no storage não derruba a limpeza.
      }
    }
  }
}

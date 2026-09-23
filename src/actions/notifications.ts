'use server'

import { createAdminClient } from '@/utils/supabase/admin'
import { getDependentHouse, getSessionProfile } from '@/utils/house'
import { sendPushToHouseAdmins } from '@/actions/push'
import { MEDIA_BUCKET } from '@/utils/media'
import { getHouseQuickMessageSettings } from '@/utils/house-settings'
import {
  cleanupQuickMessages,
  cleanupReadNotifications,
} from '@/utils/notifications'
import type { ActionResult } from './types'

/**
 * Marca uma notificação do próprio usuário como lida e, se for uma mensagem
 * rápida, aplica a regra de retenção (2 lidas → apaga a mais antiga).
 * O escopo (`recipient_id = user.id`) é sempre derivado da sessão.
 */
export async function markNotificationRead(
  notificationId: string
): Promise<ActionResult> {
  const { user } = await getSessionProfile()
  if (!user) return { ok: false, error: 'Autenticação necessária.' }

  const admin = createAdminClient()

  const { data: row } = await admin
    .from('notifications')
    .select('house_id, actor_id, type')
    .eq('id', notificationId)
    .eq('recipient_id', user.id)
    .maybeSingle()

  if (!row) return { ok: false, error: 'Notificação não encontrada.' }

  const { error } = await admin
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('recipient_id', user.id)
    .is('read_at', null)

  if (error) return { ok: false, error: 'Falha ao marcar como lida.' }

  if (row.type === 'QUICK_MESSAGE' && row.actor_id) {
    const settings = await getHouseQuickMessageSettings(row.house_id)
    await cleanupQuickMessages(admin, row.house_id, row.actor_id, settings.readRetentionDays)
  }

  return { ok: true }
}

/** Marca todas as notificações não lidas do usuário como lidas. */
export async function markAllNotificationsRead(): Promise<ActionResult> {
  const { user } = await getSessionProfile()
  if (!user) return { ok: false, error: 'Autenticação necessária.' }

  const admin = createAdminClient()

  // Pares (casa, autor) das mensagens rápidas do usuário p/ aplicar a retenção
  // depois de marcar tudo como lido.
  const { data: quickMessages } = await admin
    .from('notifications')
    .select('house_id, actor_id')
    .eq('recipient_id', user.id)
    .eq('type', 'QUICK_MESSAGE')
    .not('actor_id', 'is', null)

  const { error } = await admin
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_id', user.id)
    .is('read_at', null)

  if (error) return { ok: false, error: 'Falha ao marcar as notificações.' }

  const pairs = new Map<string, { houseId: string; actorId: string }>()
  for (const quickMessage of quickMessages ?? []) {
    if (!quickMessage.actor_id) continue
    pairs.set(`${quickMessage.house_id}:${quickMessage.actor_id}`, {
      houseId: quickMessage.house_id,
      actorId: quickMessage.actor_id,
    })
  }
  for (const pair of pairs.values()) {
    const settings = await getHouseQuickMessageSettings(pair.houseId)
    await cleanupQuickMessages(admin, pair.houseId, pair.actorId, settings.readRetentionDays)
  }

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

/**
 * Envia uma "mensagem rápida" (DEPENDENT → ADMINs da casa): texto curto
 * (até 100 caracteres, opcional se houver imagem) + no máx. 1 imagem (já
 * enviada pelo cliente ao bucket `messages`). Cada ADMIN da casa recebe uma
 * cópia com o mesmo `message_id`; ao marcar a cópia como lida, a retenção
 * (2 lidas → apaga a mais antiga) vale para a mensagem como um todo.
 *
 * Regras de negócio:
 * - Apenas DEPENDENT envia (papel derivado da sessão, nunca do cliente).
 * - O dependente envia apenas enquanto tiver menos de 2 mensagens próprias
 *   acumuladas (lidas ou não) na casa — a 3ª é bloqueada.
 * - A imagem precisa ser uma URL pública do bucket na pasta `messages`
 *   (defesa de servidor).
 */
export async function sendQuickMessage(
  text: string,
  imageUrl?: string | null
): Promise<ActionResult> {
  const { user, profile } = await getSessionProfile()
  if (!user || !profile) {
    return { ok: false, error: 'Autenticação necessária.' }
  }
  if (profile.user_role !== 'DEPENDENT') {
    return { ok: false, error: 'Apenas dependentes enviam mensagens rápidas.' }
  }

  const house = await getDependentHouse(user.id)
  if (!house) return { ok: false, error: 'Você ainda não pertence a uma casa.' }

  const settings = await getHouseQuickMessageSettings(house.id)

  const body = text.trim()
  if (body.length > settings.maxChars) {
    return {
      ok: false,
      error: `A mensagem deve ter no máximo ${settings.maxChars} caracteres.`,
    }
  }
  if (!body && !imageUrl) {
    return { ok: false, error: 'Escreva uma mensagem ou adicione uma imagem.' }
  }
  if (
    imageUrl &&
    !imageUrl.includes(
      `/storage/v1/object/public/${MEDIA_BUCKET}/messages/`
    )
  ) {
    return { ok: false, error: 'Imagem inválida.' }
  }

  const admin = createAdminClient()

  const { data: previous } = await admin
    .from('notifications')
    .select('message_id')
    .eq('house_id', house.id)
    .eq('actor_id', user.id)
    .eq('type', 'QUICK_MESSAGE')
    .not('message_id', 'is', null)

  const accumulated = new Set(
    (previous ?? [])
      .map((row) => row.message_id)
      .filter((id): id is string => !!id)
  ).size

  if (accumulated >= settings.capacity) {
    return {
      ok: false,
      error: `Você já tem ${accumulated} mensagens acumuladas. Espere os tutores lerem as anteriores.`,
    }
  }

  const { data: admins } = await admin
    .from('house_members')
    .select('profile_id')
    .eq('house_id', house.id)
    .eq('role', 'ADMIN')

  const recipientIds = (admins ?? []).map((member) => member.profile_id)
  if (recipientIds.length === 0) {
    return { ok: false, error: 'Nenhum tutor disponível na casa.' }
  }

  const messageId = crypto.randomUUID()
  const senderName = profile.full_name ?? 'Dependente'
  const now = new Date().toISOString()

  // 1 cópia por ADMIN da casa + 1 cópia para o próprio dependente (comprovante
  // do envio, já marcada como lida — chega como notificação simples, sem
  // possibilidade de edição; a retenção não conta a cópia do remetente).
  const copies: Array<{
    house_id: string
    recipient_id: string
    actor_id: string
    type: 'QUICK_MESSAGE'
    title: string
    body: string
    image_url: string | null
    message_id: string
    read_at: string | null
  }> = recipientIds.map((recipient_id) => ({
    house_id: house.id,
    recipient_id,
    actor_id: user.id,
    type: 'QUICK_MESSAGE',
    title: `Mensagem de ${senderName}`,
    body,
    image_url: imageUrl ?? null,
    message_id: messageId,
    read_at: null,
  }))

  copies.push({
    house_id: house.id,
    recipient_id: user.id,
    actor_id: user.id,
    type: 'QUICK_MESSAGE',
    title: 'Mensagem enviada',
    body,
    image_url: imageUrl ?? null,
    message_id: messageId,
    read_at: now,
  })

  const { error } = await admin.from('notifications').insert(copies)

  if (error) return { ok: false, error: 'Falha ao enviar a mensagem.' }

  // Push para os ADMINs da casa (best-effort, não bloqueia o envio) — mesmas
  // regras de `notifyHouse`: só quem não agiu recebe.
  try {
    await sendPushToHouseAdmins(
      house.id,
      {
        title: senderName ? `Mensagem de ${senderName}` : 'Nova mensagem rápida',
        body: body || 'Enviou uma imagem.',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: `casasync-quick_message`,
        data: { url: '/', notifType: 'QUICK_MESSAGE' },
        actions: [],
      },
      user.id
    )
  } catch {
    // Ignorado de propósito (push falha não deve derrubar o envio).
  }

  return { ok: true }
}

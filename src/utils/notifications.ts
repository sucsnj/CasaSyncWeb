import { createAdminClient } from '@/utils/supabase/admin'
import type { NotificationRow, NotificationType } from '@/types/notifications'

type AdminClient = ReturnType<typeof createAdminClient>

/** Notificações lidas são apagadas automaticamente após 5 dias. */
export const READ_RETENTION_DAYS = 5

const RETENTION_MS = READ_RETENTION_DAYS * 24 * 60 * 60 * 1000

type NotifyInput = {
  houseId: string
  actorId: string
  type: NotificationType
  title: string
  body: string
  link?: string | null
}

type NotifyHouseInput = NotifyInput & {
  side: 'ADMINS' | 'DEPENDENTS'
  /** Nunca notificar quem agiu. */
  excludeUserId?: string
}

/** Ids dos membros da casa com o papel informado. */
async function getHouseMemberIds(
  admin: AdminClient,
  houseId: string,
  role: 'ADMIN' | 'DEPENDENT'
): Promise<string[]> {
  const { data } = await admin
    .from('house_members')
    .select('profile_id')
    .eq('house_id', houseId)
    .eq('role', role)

  return (data ?? []).map((member) => member.profile_id)
}

/**
 * Cria uma notificação para um destinatário específico.
 *
 * Best-effort: a notificação é efeito secundário do fluxo de negócio — uma
 * falha ao gravá-la NUNCA deve derrubar a ação principal (crédito de pontos,
 * aprovação etc.).
 */
export async function notifyUser(
  admin: AdminClient,
  input: NotifyInput & { recipientId: string }
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
    })
  } catch {
    // Ignorado de propósito (best-effort).
  }
}

/**
 * Notifica "o outro lado" da ação dentro da casa: todos os ADMINs quando quem
 * agiu foi o dependente, ou todos os DEPENDENTEs quando quem agiu foi o ADMIN.
 * Quem agiu é sempre excluído. Best-effort (ver `notifyUser`).
 */
export async function notifyHouse(
  admin: AdminClient,
  input: NotifyHouseInput
): Promise<void> {
  try {
    const ids = await getHouseMemberIds(
      admin,
      input.houseId,
      input.side === 'ADMINS' ? 'ADMIN' : 'DEPENDENT'
    )

    const recipients = ids.filter((id) => id !== input.excludeUserId)
    if (recipients.length === 0) return

    await admin.from('notifications').insert(
      recipients.map((recipientId) => ({
        house_id: input.houseId,
        recipient_id: recipientId,
        actor_id: input.actorId,
        type: input.type,
        title: input.title,
        body: input.body,
        link: input.link ?? null,
      }))
    )
  } catch {
    // Ignorado de propósito (best-effort).
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

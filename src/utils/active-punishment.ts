import { cache } from 'react'
import { createAdminClient } from '@/utils/supabase/admin'
import { isPunishmentActive, type ActivePunishment } from './punishments'

/**
 * CASTIGO ATIVO DO DEPENDENTE — leitura server-side (o botão só existe para o
 * DEPENDENT, no cabeçalho; o ADMIN aplica/remove pela gestão de membros).
 *
 * Sem Realtime por decisão de produto (mesma premissa dos comunicados,
 * ADR-0017): o castigo chega ao dependente no **render** — ele o vê ao atualizar
 * a tela ou navegar. Por isso a leitura é feita em todas as telas do dependente
 * (`/dashboard/dependent`, `/tasks`, `/rewards`, `/achievements`).
 *
 * Service-role com escopo derivado da sessão (`profile_id` + `house_id` do
 * dependente), como as demais leituras cross-role (ADR-0006).
 *
 * Memoizado por request (`React.cache`), igual a `hasClaimableAchievement`.
 */
export const getActivePunishment = cache(
  async (
    profileId: string,
    houseId: string | null
  ): Promise<ActivePunishment | null> => {
    // Sem casa não há castigo a mostrar (o resto do app também degrada assim).
    if (!houseId) return null

    let admin: ReturnType<typeof createAdminClient>
    try {
      admin = createAdminClient()
    } catch {
      return null
    }

    const now = new Date()

    // Limpeza lazy: castigo vencido some do banco na próxima leitura. Best-effort
    // (a expiração já é tratada na leitura abaixo — se o delete falhar, o usuário
    // continua sem ver o ícone).
    try {
      await admin
        .from('dependent_punishments')
        .delete()
        .eq('house_id', houseId)
        .eq('profile_id', profileId)
        .not('expires_at', 'is', null)
        .lte('expires_at', now.toISOString())
    } catch (err) {
      console.error('[CASTIGO] Falha na limpeza de castigos vencidos:', err)
    }

    try {
      const { data } = await admin
        .from('dependent_punishments')
        .select('id, description, duration_days, expires_at, created_at')
        .eq('house_id', houseId)
        .eq('profile_id', profileId)
        .maybeSingle()

      if (!data || !isPunishmentActive(data, now)) return null

      return {
        id: data.id,
        description: data.description?.trim() || null,
        durationDays: data.duration_days ?? null,
        expiresAt: data.expires_at ?? null,
        createdAt: data.created_at,
      }
    } catch (err) {
      console.error('[CASTIGO] Falha ao ler o castigo ativo:', err)
      return null
    }
  }
)

/**
 * Perfis da casa que têm castigo ATIVO no momento — usado na visão do ADMIN
 * (gestão de casas) para marcar a linha do dependente e permitir remover o
 * castigo. Não memoizado: é leitura da tela de gestão, não do header.
 */
export async function getActivePunishmentProfileIds(
  houseId: string
): Promise<Set<string>> {
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return new Set()
  }

  try {
    const nowIso = new Date().toISOString()
    const { data } = await admin
      .from('dependent_punishments')
      .select('profile_id, expires_at')
      .eq('house_id', houseId)

    return new Set(
      (data ?? [])
        .filter((row) => isPunishmentActive(row, new Date(nowIso)))
        .map((row) => row.profile_id)
    )
  } catch (err) {
    console.error('[CASTIGO] Falha ao listar castigos da casa:', err)
    return new Set()
  }
}
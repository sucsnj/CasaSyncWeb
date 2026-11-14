// src/utils/redemptions.ts
import type { Tables } from '@/types/database'

type Redemption = Tables<'reward_redemptions'>

export type RedemptionView = {
  id: string
  status: Redemption['status']
  points_cost: number
  created_at: string
  resolved_at?: string | null
  rewardTitle: string
  reward_id: string
  dependentName?: string
}

export type GroupedRedemption = RedemptionView & {
  totalCount: number
}

/** Sugestão de recompensa como a tela a consome (nome do autor já resolvido). */
export type RewardsSuggestionView = {
  id: string
  title: string
  description: string | null
  points_cost: number | null
  image_url: string | null
  status: Tables<'reward_suggestions'>['status']
  created_at: string
  profileName: string
}

/**
 * Payload da tela de recompensas (catálogo + resgates + sugestões).
 *
 * Fica num único tipo porque a tela inteira é **uma** query no cache e **uma**
 * Server Action na revalidação — dividi-la criaria ações concorrentes.
 */
export type RewardsCacheData = {
  rewards: Tables<'rewards'>[]
  redemptions: RedemptionView[]
  suggestions: RewardsSuggestionView[]
}

/**
 * Retorna a data em que o resgate foi efetivamente resolvido/tratado,
 * usando 'created_at' como fallback apenas para itens pendentes.
 */
export function getRedemptionDisplayDate(redemption: RedemptionView): string {
  return redemption.resolved_at ?? redemption.created_at
}

export function groupRedemptionsByStatus(
  redemptions: RedemptionView[]
): GroupedRedemption[] {
  return Object.values(
    redemptions.reduce((acc, redemption) => {
      const groupKey = `${redemption.rewardTitle}-${redemption.status}`

      if (!acc[groupKey]) {
        acc[groupKey] = {
          ...redemption,
          totalCount: 0,
        }
      }

      acc[groupKey].totalCount += 1

      // Mantém a data de resolução (resolved_at) do resgate mais recente do grupo
      const currentResolvedIso = redemption.resolved_at ?? redemption.created_at
      const storedResolvedIso = acc[groupKey].resolved_at ?? acc[groupKey].created_at

      if (new Date(currentResolvedIso) > new Date(storedResolvedIso)) {
        acc[groupKey].resolved_at =
          redemption.resolved_at ?? acc[groupKey].resolved_at
      }

      return acc
    }, {} as Record<string, GroupedRedemption>)
  )
}
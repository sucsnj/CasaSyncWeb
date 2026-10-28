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
'use server'

import { createAdminClient } from '@/utils/supabase/admin'
import { getSessionProfile } from '@/utils/house'
import { assertHouseAccess } from '@/utils/tenant-scope'
import type { Tables } from '@/types/database'
import type { RedemptionView } from '@/utils/redemptions'

type Redemption = Tables<'reward_redemptions'>
type RewardSuggestion = Tables<'reward_suggestions'>

export type RedemptionDependentView = RedemptionView

export type SuggestionAdminView = {
  id: string
  title: string
  description: string | null
  points_cost: number | null
  image_url: string | null
  status: RewardSuggestion['status']
  created_at: string
  profileName: string
}

export type SuggestionDependentView = {
  id: string
  title: string
  description: string | null
  points_cost: number | null
  status: RewardSuggestion['status']
  created_at: string
}

export type SuggestionView = SuggestionAdminView | SuggestionDependentView

export type RewardsBundleBase = {
  houseId: string
  rewards: Tables<'rewards'>[]
  redemptions: RedemptionView[]
}

export type RewardsAdminBundle = RewardsBundleBase & {
  role: 'ADMIN'
  suggestions: SuggestionAdminView[]
  /** ADMIN: dependentes da casa (para o seletor e nomes). */
  dependents: { id: string; full_name: string }[]
}

export type RewardsDependentBundle = RewardsBundleBase & {
  role: 'DEPENDENT'
  suggestions: SuggestionDependentView[]
}

export type RewardsBundle = RewardsAdminBundle | RewardsDependentBundle

export async function listRewards(houseId: string): Promise<RewardsBundle> {
  const access = await assertHouseAccess(houseId)
  if (!access.ok) throw new Error('FORBIDDEN')

  const admin = createAdminClient()

  if (access.role === 'ADMIN') {
    const [{ data: rewards }, { data: redemptions }, { data: members }, { data: suggestions }] =
      await Promise.all([
        admin
          .from('rewards')
          .select('*')
          .eq('house_id', houseId)
          .order('created_at', { ascending: true }),
        admin
          .from('reward_redemptions')
          .select('*')
          .eq('house_id', houseId)
          .order('created_at', { ascending: true }),
        admin
          .from('house_members')
          .select('profile_id')
          .eq('house_id', houseId)
          .eq('role', 'DEPENDENT'),
        admin
          .from('reward_suggestions')
          .select('*')
          .eq('house_id', houseId)
          .order('created_at', { ascending: false }),
      ])

    const profileIds = members?.map((member) => member.profile_id) ?? []
    const nameById = new Map<string, string>()
    if (profileIds.length > 0) {
      const { data: profiles } = await admin
        .from('profiles')
        .select('id, full_name')
        .in('id', profileIds)
      ;(profiles ?? []).forEach((p) => nameById.set(p.id, p.full_name ?? 'Sem nome'))
    }

    const rewardTitleById = new Map(
      (rewards ?? []).map((reward) => [reward.id, reward.title])
    )

    const redemptionViews = (redemptions ?? []).map((redemption: Redemption) => ({
      id: redemption.id,
      status: redemption.status,
      points_cost: redemption.points_cost,
      created_at: redemption.created_at,
      resolved_at: redemption.resolved_at,
      reward_id: redemption.reward_id,
      rewardTitle: rewardTitleById.get(redemption.reward_id) ?? 'Recompensa',
      dependentName: nameById.get(redemption.profile_id) ?? 'Dependente',
    }))

    const suggestionViews: SuggestionAdminView[] = (suggestions ?? []).map(
      (suggestion) => ({
        id: suggestion.id,
        title: suggestion.title,
        description: suggestion.description,
        points_cost: suggestion.points_cost,
        image_url: suggestion.image_url,
        status: suggestion.status,
        created_at: suggestion.created_at,
        profileName: nameById.get(suggestion.profile_id) ?? 'Dependente',
      })
    )

    return {
      role: 'ADMIN',
      houseId,
      rewards: rewards ?? [],
      redemptions: redemptionViews,
      suggestions: suggestionViews,
      dependents: Array.from(nameById, ([id, full_name]) => ({ id, full_name })),
    }
  }

  const { data: redemptions } = await admin
    .from('reward_redemptions')
    .select('*')
    .eq('house_id', houseId)
    .eq('profile_id', access.userId)
    .order('created_at', { ascending: true })

  const [{ data: rewards }, { data: suggestions }] = await Promise.all([
    admin
      .from('rewards')
      .select('*')
      .eq('house_id', houseId)
      .order('created_at', { ascending: true }),
    admin
      .from('reward_suggestions')
      .select('*')
      .eq('house_id', houseId)
      .eq('profile_id', access.userId)
      .order('created_at', { ascending: false }),
  ])

  const rewardTitleById = new Map(
    (rewards ?? []).map((reward) => [reward.id, reward.title])
  )

  const redemptionViews = (redemptions ?? []).map((redemption: Redemption) => ({
    id: redemption.id,
    status: redemption.status,
    points_cost: redemption.points_cost,
    created_at: redemption.created_at,
    resolved_at: redemption.resolved_at,
    reward_id: redemption.reward_id,
    rewardTitle: rewardTitleById.get(redemption.reward_id) ?? 'Recompensa',
  }))

  const suggestionViews: SuggestionDependentView[] = (suggestions ?? []).map(
    (suggestion) => ({
      id: suggestion.id,
      title: suggestion.title,
      description: suggestion.description,
      points_cost: suggestion.points_cost,
      status: suggestion.status,
      created_at: suggestion.created_at,
    })
  )

  return {
    role: 'DEPENDENT',
    houseId,
    rewards: rewards ?? [],
    redemptions: redemptionViews,
    suggestions: suggestionViews,
  }
}

/** Saldo de pontos do usuário da sessão (página de recompensas do dependente). */
export async function getMyProfilePoints(): Promise<{ id: string; points: number }> {
  const { user } = await getSessionProfile()
  if (!user) throw new Error('UNAUTHENTICATED')

  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('id, points')
    .eq('id', user.id)
    .maybeSingle()

  if (!data) throw new Error('NOT_FOUND')
  return { id: data.id, points: data.points }
}

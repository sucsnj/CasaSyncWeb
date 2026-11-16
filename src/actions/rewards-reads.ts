'use server'

import { createAdminClient } from '@/utils/supabase/admin'
import {
  getHouseTextLimitsSettings,
  getHouseTimezoneSettings,
} from '@/utils/house-settings'
import {
  zonedDayStart,
  zonedMonthStart,
} from '@/utils/timezone'
import { assertHouseAccess } from '@/utils/tenant-scope'
import {
  type TextLimitsSettings,
} from '@/utils/settings'
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
  textLimits: TextLimitsSettings
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
  points: number
  /** Fronteiras do dia/mês corrente no fuso da casa (calculadas no servidor). */
  dayStartIso: string
  monthStartIso: string
}

export type RewardsBundle = RewardsAdminBundle | RewardsDependentBundle

export async function listRewards(houseId: string): Promise<RewardsBundle> {
  const access = await assertHouseAccess(houseId)
  if (!access.ok) throw new Error('FORBIDDEN')

  const admin = createAdminClient()
  const textLimits = await getHouseTextLimitsSettings(houseId)

  if (access.role === 'ADMIN') {
    const [
      { data: rewards, error: rewardsError },
      { data: redemptions, error: redemptionsError },
      { data: members, error: membersError },
      { data: suggestions, error: suggestionsError },
    ] = await Promise.all([
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

    if (rewardsError || redemptionsError || membersError || suggestionsError) {
      throw new Error('READ_FAILED')
    }

    const profileIds = members?.map((member) => member.profile_id) ?? []
    const nameById = new Map<string, string>()
    if (profileIds.length > 0) {
      const { data: profiles, error: profilesError } = await admin
        .from('profiles')
        .select('id, full_name')
        .in('id', profileIds)
      if (profilesError) throw new Error('READ_FAILED')
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
      textLimits,
    }
  }

  const { data: redemptions, error: redemptionsError } = await admin
    .from('reward_redemptions')
    .select('*')
    .eq('house_id', houseId)
    .eq('profile_id', access.userId)
    .order('created_at', { ascending: true })

  if (redemptionsError) throw new Error('READ_FAILED')

  const [{ data: rewards, error: rewardsError }, { data: suggestions, error: suggestionsError }] = await Promise.all([
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

  if (rewardsError || suggestionsError) throw new Error('READ_FAILED')

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

  // Fronteiras das janelas do limitador de resgate (dia/mês corrente no fuso
  // da CASA) — calculadas aqui para o cliente só comparar instantes.
  const { timezone } = await getHouseTimezoneSettings(houseId)
  const now = new Date()
  const dayStartIso = zonedDayStart(timezone, now).toISOString()
  const monthStartIso = zonedMonthStart(timezone, now).toISOString()

  // Saldo atual (mesmo cliente service role; o /rewards mostra o número no header).
  const { data: profileRow, error: profileError } = await admin
    .from('profiles')
    .select('points')
    .eq('id', access.userId)
    .maybeSingle()
  if (profileError || !profileRow) throw new Error('READ_FAILED')
  const points = profileRow.points

  return {
    role: 'DEPENDENT',
    houseId,
    rewards: rewards ?? [],
    redemptions: redemptionViews,
    suggestions: suggestionViews,
    textLimits,
    points,
    dayStartIso,
    monthStartIso,
  }
}

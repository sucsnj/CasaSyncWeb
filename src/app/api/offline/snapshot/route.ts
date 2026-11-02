import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { getActiveAdminHouse, getDependentHouse } from '@/utils/house'
import { getSessionProfile } from '@/utils/house'
import { getHouseTextLimitsSettings, getHouseTimezoneSettings } from '@/utils/house-settings'
import { getProfileNames } from '@/utils/house'
import { zonedDayStart, zonedMonthStart } from '@/utils/timezone'
import type { Tables } from '@/types/database'

export const dynamic = 'force-dynamic'

type TaskRow = Tables<'tasks'>
type RewardRow = Tables<'rewards'>
type RedemptionRow = Tables<'reward_redemptions'>
type SuggestionRow = Tables<'reward_suggestions'>

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

export async function GET() {
  const { user, profile } = await getSessionProfile()

  if (!user || !profile) {
    return json({ ok: false, error: 'Autenticação necessária.' }, 401)
  }

  const admin = createAdminClient()
  const isAdmin = profile.user_role === 'ADMIN'

  const [activeHouse, dependentHouse] = await Promise.all([
    isAdmin ? getActiveAdminHouse() : Promise.resolve(null),
    isAdmin ? Promise.resolve(null) : getDependentHouse(user.id),
  ])

  const house = isAdmin ? activeHouse : dependentHouse

  if (!house) {
    return json({
      ok: true,
      generatedAt: new Date().toISOString(),
      userId: user.id,
      role: profile.user_role,
      houseId: null,
      data: { tasks: [], rewards: [], redemptions: [], suggestions: [] },
    })
  }

  const houseId = house.id

  if (isAdmin) {
    const [
      { data: tasks },
      assignees,
      { data: rewards },
      { data: redemptions },
      { data: members },
      { data: suggestions },
    ] = await Promise.all([
      admin
        .from('tasks')
        .select('*')
        .eq('house_id', houseId)
        .order('created_at', { ascending: false }),
      getHouseAssigneesSnapshot(admin, houseId),
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
      ;(profiles ?? []).forEach((p) =>
        nameById.set(p.id, p.full_name ?? 'Sem nome')
      )
    }

    const rewardTitleById = new Map(
      (rewards ?? []).map((reward) => [reward.id, reward.title])
    )

    return json({
      ok: true,
      generatedAt: new Date().toISOString(),
      userId: user.id,
      role: profile.user_role,
      houseId,
      data: {
        tasks: (tasks ?? []) as TaskRow[],
        assignees,
        rewards: (rewards ?? []) as RewardRow[],
        redemptions: (redemptions ?? []).map((redemption: RedemptionRow) => ({
          ...redemption,
          rewardTitle:
            rewardTitleById.get(redemption.reward_id) ?? 'Recompensa',
          dependentName:
            nameById.get(redemption.profile_id) ?? 'Dependente',
        })),
        suggestions: (suggestions ?? []).map((suggestion: SuggestionRow) => ({
          ...suggestion,
          profileName: nameById.get(suggestion.profile_id) ?? 'Dependente',
        })),
        dependents: Array.from(nameById, ([id, full_name]) => ({
          id,
          full_name,
        })),
      },
    })
  }

  const [{ data: tasks }, { data: rewards }, { data: redemptions }, { data: suggestions }] =
    await Promise.all([
      admin
        .from('tasks')
        .select('*')
        .eq('house_id', houseId)
        .eq('assigned_to', user.id)
        .neq('status', 'ON_HOLD')
        .order('created_at', { ascending: false }),
      admin
        .from('rewards')
        .select('*')
        .eq('house_id', houseId)
        .order('created_at', { ascending: true }),
      admin
        .from('reward_redemptions')
        .select('*')
        .eq('house_id', houseId)
        .eq('profile_id', user.id)
        .order('created_at', { ascending: true }),
      admin
        .from('reward_suggestions')
        .select('*')
        .eq('house_id', houseId)
        .eq('profile_id', user.id)
        .order('created_at', { ascending: false }),
    ])

  const taskList = (tasks ?? []) as TaskRow[]
  const creatorNameMap = await getProfileNames(
    taskList.map((task) => task.created_by)
  )

  const rewardTitleById = new Map(
    (rewards ?? []).map((reward) => [reward.id, reward.title])
  )

  const redemptionViews = (redemptions ?? []).map(
    (redemption: RedemptionRow) => ({
      ...redemption,
      rewardTitle:
        rewardTitleById.get(redemption.reward_id) ?? 'Recompensa',
    })
  )

  const { timezone } = await getHouseTimezoneSettings(houseId)
  const now = new Date()
  const dayStartIso = zonedDayStart(timezone, now).toISOString()
  const monthStartIso = zonedMonthStart(timezone, now).toISOString()

  const textLimits = await getHouseTextLimitsSettings(houseId)

  return json({
    ok: true,
    generatedAt: new Date().toISOString(),
    userId: user.id,
    role: profile.user_role,
    houseId,
    data: {
      tasks: taskList,
      creatorNames: creatorNameMap,
      rewards: (rewards ?? []) as RewardRow[],
      redemptions: redemptionViews,
      suggestions: (suggestions ?? []).map((suggestion: SuggestionRow) => ({
        id: suggestion.id,
        title: suggestion.title,
        description: suggestion.description,
        points_cost: suggestion.points_cost,
        status: suggestion.status,
        created_at: suggestion.created_at,
        image_url: suggestion.image_url,
      })),
      dayStartIso,
      monthStartIso,
      textLimits,
      points: profile.points,
    },
  })
}

async function getHouseAssigneesSnapshot(
  admin: ReturnType<typeof createAdminClient>,
  houseId: string
) {
  const { data: members } = await admin
    .from('house_members')
    .select('profile_id')
    .eq('house_id', houseId)
    .eq('role', 'DEPENDENT')

  const profileIds = members?.map((member) => member.profile_id) ?? []
  if (profileIds.length === 0) return []

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, full_name')
    .in('id', profileIds)

  return (profiles ?? []).map((profile) => ({
    id: profile.id,
    full_name: profile.full_name ?? 'Sem nome',
  }))
}

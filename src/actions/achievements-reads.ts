'use server'

import { createAdminClient } from '@/utils/supabase/admin'
import { getHouseAssignees } from '@/utils/house'
import { getHouseTextLimitsSettings } from '@/utils/house-settings'
import type { TextLimitsSettings } from '@/utils/settings'
import { assertHouseAccess } from '@/utils/tenant-scope'
import type { Tables } from '@/types/database'

export type AchievementRow = Tables<'achievements'>
export type DependentAchievementRow = Tables<'dependent_achievements'>

export type AchievementProgressEntry = {
  id: string
  achievement_id: string
  profile_id: string
  level: number
  current_progress: number
  unlocked_at: string | null
}
export type AchievementDependentProgress = {
  level: number
  current_progress: number
  unlocked_at: string | null
}
export type AchievementDependentView = {
  achievement: AchievementRow
  progress: AchievementDependentProgress | null
}

export type AchievementsDependentBundle = {
  role: 'DEPENDENT'
  houseId: string
  views: AchievementDependentView[]
}

export type AchievementsAdminBundle = {
  role: 'ADMIN'
  houseId: string
  achievements: AchievementRow[]
  progress: AchievementProgressEntry[]
  dependents: { id: string; full_name: string }[]
  textLimits: TextLimitsSettings
}

export type AchievementsBundle = AchievementsAdminBundle | AchievementsDependentBundle

export async function listAchievements(
  houseId: string
): Promise<AchievementsBundle> {
  const access = await assertHouseAccess(houseId)
  if (!access.ok) throw new Error('FORBIDDEN')

  const admin = createAdminClient()

  if (access.role === 'ADMIN') {
    const [achievements, progress, dependents, textLimits] = await Promise.all([
      admin
        .from('achievements')
        .select('*')
        .eq('house_id', houseId)
        .order('created_at', { ascending: true }),
      admin
        .from('dependent_achievements')
        .select('id, achievement_id, profile_id, level, current_progress, unlocked_at')
        .eq('house_id', houseId),
      getHouseAssignees(houseId),
      getHouseTextLimitsSettings(houseId),
    ])

    return {
      role: 'ADMIN',
      houseId,
      achievements: achievements.data ?? [],
      progress: (progress.data ?? []) as AchievementProgressEntry[],
      dependents,
      textLimits,
    }
  }

  const [achievements, progress] = await Promise.all([
    admin
      .from('achievements')
      .select('*')
      .eq('house_id', houseId)
      .order('created_at', { ascending: true }),
    admin
      .from('dependent_achievements')
      .select('id, achievement_id, level, current_progress, unlocked_at')
      .eq('house_id', houseId)
      .eq('profile_id', access.userId),
  ])

  const views: AchievementDependentView[] = (achievements.data ?? []).map(
    (achievement) => {
      const entry = progress.data?.find(
        (line) => line.achievement_id === achievement.id
      )
      return {
        achievement,
        progress: entry
          ? {
              level: entry.level,
              current_progress: entry.current_progress,
              unlocked_at: entry.unlocked_at,
            }
          : null,
      }
    }
  )

  return { role: 'DEPENDENT', houseId, views }
}

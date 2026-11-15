'use client'

import { useAppSession } from '@/components/session/app-session'
import { NoHouseCard } from '@/components/session/no-house-card'
import { AchievementsAdmin } from '@/components/achievements/achievements-admin'
import { AchievementsDependent } from '@/components/achievements/achievements-dependent'

/** Shell cliente de `/achievements`: escolhe a experiência por papel/sessão. */
export function AchievementsScreen() {
  const { role, houseId } = useAppSession()

  if (!houseId) return <NoHouseCard role={role} />
  return role === 'ADMIN' ? (
    <AchievementsAdmin houseId={houseId} />
  ) : (
    <AchievementsDependent houseId={houseId} />
  )
}

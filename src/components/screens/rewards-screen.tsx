'use client'

import { useAppSession } from '@/components/session/app-session'
import { NoHouseCard } from '@/components/session/no-house-card'
import { RewardsAdmin } from '@/components/rewards/rewards-admin'
import { RewardsDependent } from '@/components/rewards/rewards-dependent'

/** Shell cliente de `/rewards`: escolhe a experiência por papel/sessão. */
export function RewardsScreen() {
  const { role, houseId } = useAppSession()

  if (!houseId) return <NoHouseCard role={role} />

  return role === 'ADMIN' ? (
    <RewardsAdmin houseId={houseId} />
  ) : (
    <RewardsDependent houseId={houseId} />
  )
}

'use client'

import { useAppSession } from '@/components/session/app-session'
import { useHousesBundle } from '@/hooks/queries/use-houses'
import { HousesManager } from '@/components/houses/houses-manager'
import { PageSkeleton } from '@/components/ui/page-skeleton'
import { QueryError } from '@/components/session/query-error'

export function HousesScreen() {
  const { userId } = useAppSession()
  const { data, isPending, refetch } = useHousesBundle(userId)

  if (isPending && !data) return <PageSkeleton cards={4} />
  if (!data) return <QueryError onRetry={() => void refetch()} />

  return (
    <HousesManager
      houses={data.houses}
      activeHouseId={data.activeHouseId}
      activeHouseName={data.activeHouseName}
      activeHouseImageUrl={data.activeHouseImageUrl}
      activeHouseOwnerId={data.activeHouseOwnerId}
      currentUserId={userId}
      members={data.members}
      activePunishments={data.activePunishments}
      timezone={data.timezone}
    />
  )
}

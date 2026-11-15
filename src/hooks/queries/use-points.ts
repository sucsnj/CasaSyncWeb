'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getMyProfilePoints } from '@/actions/rewards-reads'
import { qk } from '@/lib/query/keys'

export function useMyPoints(userId: string, initialPoints: number) {
  return useQuery({
    queryKey: qk.points(userId),
    queryFn: getMyProfilePoints,
    initialData: { id: userId, points: initialPoints },
  })
}

export function applyMyPoints(
  queryClient: ReturnType<typeof useQueryClient>,
  userId: string,
  points: number
) {
  queryClient.setQueryData(qk.points(userId), { id: userId, points })
}

'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getHousesBundle } from '@/actions/houses-reads'
import { qk } from '@/lib/query/keys'

export function useHousesBundle(userId: string) {
  return useQuery({
    queryKey: qk.housesBundle(userId),
    queryFn: () => getHousesBundle(),
    enabled: Boolean(userId),
    staleTime: 30_000,
  })
}

export function useInvalidateHouses() {
  const queryClient = useQueryClient()
  return (userId: string) =>
    queryClient.invalidateQueries({ queryKey: qk.housesBundle(userId) })
}

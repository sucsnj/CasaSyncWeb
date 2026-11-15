'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listRewards,
  type RewardsAdminBundle,
  type RewardsDependentBundle,
} from '@/actions/rewards-reads'
import { qk } from '@/lib/query/keys'

export function useRewardsAdminBundle(houseId: string) {
  return useQuery({
    queryKey: qk.rewards(houseId),
    queryFn: async () => {
      const bundle = await listRewards(houseId)
      if (bundle.role !== 'ADMIN') throw new Error('ROLE_MISMATCH')
      return bundle
    },
  })
}

export function useRewardsDependentBundle(houseId: string) {
  return useQuery({
    queryKey: qk.rewards(houseId),
    queryFn: async () => {
      const bundle = await listRewards(houseId)
      if (bundle.role !== 'DEPENDENT') throw new Error('ROLE_MISMATCH')
      return bundle
    },
  })
}

export function useInvalidateRewards() {
  const queryClient = useQueryClient()
  return (houseId: string) =>
    queryClient.invalidateQueries({ queryKey: qk.rewards(houseId) })
}

export function patchRewards(
  queryClient: ReturnType<typeof useQueryClient>,
  houseId: string,
  fn: (bundle: RewardsAdminBundle) => RewardsAdminBundle
) {
  queryClient.setQueryData<RewardsAdminBundle>(qk.rewards(houseId), (old) =>
    old ? fn(old) : undefined
  )
}

/** Realtime de `profiles.points`: patcha o saldo guardado no bundle do dependente. */
export function patchDependentRewardsPoints(
  queryClient: ReturnType<typeof useQueryClient>,
  houseId: string,
  points: number
) {
  queryClient.setQueryData<RewardsDependentBundle>(
    qk.rewards(houseId),
    (old) => (old ? { ...old, points } : old)
  )
}

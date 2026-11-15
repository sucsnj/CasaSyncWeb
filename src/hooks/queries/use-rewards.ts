'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listRewards,
  type RewardsBundle,
} from '@/actions/rewards-reads'
import { qk } from '@/lib/query/keys'

type AdminRewardsBundle = Extract<RewardsBundle, { role: 'ADMIN' }>
type DependentRewardsBundle = Extract<RewardsBundle, { role: 'DEPENDENT' }>

export function useRewardsAdminBundle(
  houseId: string,
  initialData: AdminRewardsBundle
) {
  return useQuery({
    queryKey: qk.rewards(houseId),
    queryFn: async () => {
      const bundle = await listRewards(houseId)
      if (bundle.role !== 'ADMIN') throw new Error('ROLE_MISMATCH')
      return bundle
    },
    initialData,
  })
}

export function useRewardsDependentBundle(
  houseId: string,
  initialData: DependentRewardsBundle
) {
  return useQuery({
    queryKey: qk.rewards(houseId),
    queryFn: async () => {
      const bundle = await listRewards(houseId)
      if (bundle.role !== 'DEPENDENT') throw new Error('ROLE_MISMATCH')
      return bundle
    },
    initialData,
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
  fn: (bundle: AdminRewardsBundle) => AdminRewardsBundle
) {
  queryClient.setQueryData<AdminRewardsBundle>(qk.rewards(houseId), (old) =>
    old ? fn(old) : undefined
  )
}

'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listAchievements,
  type AchievementsAdminBundle,
} from '@/actions/achievements-reads'
import { qk } from '@/lib/query/keys'

export function useAchievementsAdminBundle(houseId: string) {
  return useQuery({
    queryKey: qk.achievements(houseId),
    queryFn: async () => {
      const bundle = await listAchievements(houseId)
      if (bundle.role !== 'ADMIN') throw new Error('ROLE_MISMATCH')
      return bundle
    },
  })
}

export function useAchievementsDependentBundle(houseId: string) {
  return useQuery({
    queryKey: qk.achievements(houseId),
    queryFn: async () => {
      const bundle = await listAchievements(houseId)
      if (bundle.role !== 'DEPENDENT') throw new Error('ROLE_MISMATCH')
      return bundle
    },
  })
}

export function patchAchievementsAdmin(
  queryClient: ReturnType<typeof useQueryClient>,
  houseId: string,
  fn: (bundle: AchievementsAdminBundle) => AchievementsAdminBundle
) {
  queryClient.setQueryData<AchievementsAdminBundle>(
    qk.achievements(houseId),
    (old) => (old ? fn(old) : undefined)
  )
}

export function useInvalidateAchievements() {
  const queryClient = useQueryClient()
  return (houseId: string) =>
    queryClient.invalidateQueries({ queryKey: qk.achievements(houseId) })
}

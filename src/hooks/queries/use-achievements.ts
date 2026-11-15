'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listAchievements,
  type AchievementsAdminBundle,
  type AchievementsDependentBundle,
} from '@/actions/achievements-reads'
import { qk } from '@/lib/query/keys'

export function useAchievementsAdminBundle(
  houseId: string,
  initialData: AchievementsAdminBundle
) {
  return useQuery({
    queryKey: qk.achievements(houseId),
    queryFn: async () => {
      const bundle = await listAchievements(houseId)
      if (bundle.role !== 'ADMIN') throw new Error('ROLE_MISMATCH')
      return bundle
    },
    initialData,
  })
}

export function useAchievementsDependentBundle(
  houseId: string,
  initialData: AchievementsDependentBundle
) {
  return useQuery({
    queryKey: qk.achievements(houseId),
    queryFn: async () => {
      const bundle = await listAchievements(houseId)
      if (bundle.role !== 'DEPENDENT') throw new Error('ROLE_MISMATCH')
      return bundle
    },
    initialData,
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

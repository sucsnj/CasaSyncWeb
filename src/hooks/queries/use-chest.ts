'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listChest,
} from '@/actions/chest-reads'
import { qk } from '@/lib/query/keys'

export function useChestAdminBundle(houseId: string) {
  return useQuery({
    queryKey: qk.chest(houseId),
    queryFn: async () => {
      const bundle = await listChest(houseId)
      if (bundle.role !== 'ADMIN') throw new Error('ROLE_MISMATCH')
      return bundle
    },
  })
}

export function useChestDependentBundle(houseId: string) {
  return useQuery({
    queryKey: qk.chest(houseId),
    queryFn: async () => {
      const bundle = await listChest(houseId)
      if (bundle.role !== 'DEPENDENT') throw new Error('ROLE_MISMATCH')
      return bundle
    },
  })
}

export function useInvalidateChest() {
  const queryClient = useQueryClient()
  return (houseId: string) =>
    queryClient.invalidateQueries({ queryKey: qk.chest(houseId) })
}

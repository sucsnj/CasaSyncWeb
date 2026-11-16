'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getSettingsBundle } from '@/actions/settings-reads'
import { qk } from '@/lib/query/keys'

export function useSettingsBundle(houseId: string | null) {
  return useQuery({
    queryKey: qk.settingsBundle(houseId ?? 'pending'),
    queryFn: () => getSettingsBundle(),
    enabled: Boolean(houseId),
    staleTime: 30_000,
  })
}

export function useInvalidateSettings() {
  const queryClient = useQueryClient()
  return (houseId: string | null) =>
    queryClient.invalidateQueries({
      queryKey: qk.settingsBundle(houseId ?? 'pending'),
    })
}

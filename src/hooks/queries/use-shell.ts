'use client'

import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getShellBundle } from '@/actions/shell-reads'
import { qk } from '@/lib/query/keys'

export function useShellBundle(userId: string | null) {
  return useQuery({
    queryKey: qk.shell(userId ?? 'anonymous'),
    queryFn: () => getShellBundle(),
    enabled: Boolean(userId),
    staleTime: 30_000,
  })
}

export function useInvalidateShell() {
  const queryClient = useQueryClient()
  return useCallback(
    (userId: string) => queryClient.invalidateQueries({ queryKey: qk.shell(userId) }),
    [queryClient]
  )
}

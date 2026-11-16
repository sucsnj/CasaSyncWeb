'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getComunicadosBundle } from '@/actions/comunicados-reads'
import { qk } from '@/lib/query/keys'
import type { Tables } from '@/types/database'

type Comunicado = Tables<'comunicados'>

export function useComunicadosBundle(houseId: string | null) {
  return useQuery({
    queryKey: qk.comunicadosBundle(houseId ?? 'pending'),
    queryFn: () => getComunicadosBundle(),
    enabled: Boolean(houseId),
    staleTime: 30_000,
  })
}

export type ComunicadosBundleUpdater = (
  bundle: { comunicados: Comunicado[]; confirmations: Record<string, number> }
) => { comunicados: Comunicado[]; confirmations: Record<string, number> }

export function patchComunicados(
  queryClient: ReturnType<typeof useQueryClient>,
  houseId: string | null,
  fn: ComunicadosBundleUpdater
) {
  queryClient.setQueryData(
    qk.comunicadosBundle(houseId ?? 'pending'),
    (old: { comunicados: Comunicado[]; confirmations: Record<string, number> } | undefined) =>
      old ? fn(old) : undefined
  )
}

export function useInvalidateComunicados() {
  const queryClient = useQueryClient()
  return (houseId: string | null) =>
    queryClient.invalidateQueries({
      queryKey: qk.comunicadosBundle(houseId ?? 'pending'),
    })
}

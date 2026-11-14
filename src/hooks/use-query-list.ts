'use client'

import { useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

type UseQueryListOptions<T> = {
  /** Chave da query (vem de `src/lib/query-keys.ts`). */
  queryKey: readonly unknown[]
  /** `queryFn`: a Server Action de leitura da tela. */
  queryFn: () => Promise<T[]>
  /**
   * Dado vindo do servidor no primeiro render (RSC). Entra como `initialData`:
   * a tela aparece instantaneamente e **não** dispara requisição — o cache já
   * nasce com o dado.
   */
  initialData?: T[]
  /** Crítico (saldo/pontos) revalida ao voltar para a aba. */
  refetchOnWindowFocus?: boolean
}

/**
 * Lista do cache do React Query com uma API de escrita compatível com
 * `useState` (`setData(prev => next)`).
 *
 * **Por que a API é `setData` e não `setQueryData` direto:** os componentes já
 * escrevem na lista em ~15 pontos (otimista, Realtime, undo de anexo). Trocar o
 * `useState` por `useQuery` e manter essas escritas intactas evita um diff
 * gigante e mantém o "prev" vindo do cache — que é a **única** verdade.
 */
export function useQueryList<T>({
  queryKey,
  queryFn,
  initialData,
  refetchOnWindowFocus,
}: UseQueryListOptions<T>) {
  const queryClient = useQueryClient()
  const keyString = useMemo(() => JSON.stringify(queryKey), [queryKey])

  const query = useQuery<T[]>({
    queryKey,
    queryFn,
    initialData,
    refetchOnWindowFocus,
  })

  const setData = useCallback(
    (updater: (previous: T[]) => T[]) => {
      queryClient.setQueryData<T[]>(queryKey, (previous) => updater(previous ?? []))
    },
    // `keyString` é a identidade estável da chave (o array é recriado a cada
    // render) — sem isso o callback mudaria de identidade o tempo todo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient, keyString]
  )

  return {
    data: query.data ?? [],
    setData,
    isFetching: query.isFetching,
    isLoading: query.isLoading,
  }
}

'use client'

import { useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

type UseQueryScreenOptions<T> = {
  /** Chave da tela (vem de `src/lib/query-keys.ts`). */
  queryKey: readonly unknown[]
  /** `queryFn`: a Server Action de leitura da tela. */
  queryFn: () => Promise<T>
  /** Dado vindo do servidor no primeiro render (RSC) — vira `initialData`. */
  initialData?: T
  /** Crítico (saldo/pontos) revalida ao voltar para a aba. */
  refetchOnWindowFocus?: boolean
}

/**
 * Cache de **uma tela inteira** no React Query, com a forma de escrita
 * `setData(prev => next)`.
 *
 * **Quando usar em vez de `useQueryList`:** a tela tem **várias listas** que
 * mudam juntas (catálogo + resgates + sugestões). Uma chave só significa **uma**
 * Server Action na revalidação — o Next.js enfileira actions concorrentes, e
 * várias actions na mesma tela viravam fila sequencial.
 *
 * O `data` pode ser `undefined` enquanto a primeira leitura não volta (aí a
 * tela usa o `initialData`, que vem do mesmo fetch do servidor).
 */
export function useQueryScreen<T>({
  queryKey,
  queryFn,
  initialData,
  refetchOnWindowFocus,
}: UseQueryScreenOptions<T>) {
  const queryClient = useQueryClient()
  const keyString = useMemo(() => JSON.stringify(queryKey), [queryKey])

  const query = useQuery<T>({
    queryKey,
    queryFn,
    initialData,
    refetchOnWindowFocus,
  })

  const setData = useCallback(
    (updater: (previous: T) => T) => {
      queryClient.setQueryData<T>(queryKey, (previous) =>
        updater(previous as T)
      )
    },
    // `keyString` é a identidade estável da chave (o array é recriado a cada
    // render) — sem isso o callback mudaria de identidade o tempo todo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient, keyString]
  )

  return {
    data: query.data,
    setData,
    isFetching: query.isFetching,
    isLoading: query.isLoading,
  }
}

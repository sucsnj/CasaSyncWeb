'use client'

import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'

/**
 * Invalida **tudo** de um escopo de tela (ex.: `tasks`), sem recarregar a
 * página — o `queryFn` (Server Action da tela) roda em background e o cache é
 * atualizado na hora disponível.
 *
 * **Por que o prefixo e não a chave exata:** as telas usam chaves como
 * `['tasks', 'house', id]`. O prefixo `['tasks']` cobre todas as variantes da
 * tela sem precisar conhecer o recorte exato daqui.
 */
export function useInvalidateScope(scope: string) {
  const queryClient = useQueryClient()
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: [scope] }),
    [queryClient, scope]
  )
}

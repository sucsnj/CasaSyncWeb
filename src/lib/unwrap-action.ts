import type { ActionResult } from '@/actions/types'

/**
 * Adapta uma Server Action no formato `ActionResult` para o `queryFn` do React
 * Query, que resolve **o dado** (e não um envelope).
 *
 * Erro vira exceção: o React Query trata a query como `error` e a tela segue
 * mostrando o último dado bom do cache (SWR) — que é exatamente o
 * comportamento local-first desejado.
 */
export async function unwrapAction<T>(
  action: () => Promise<ActionResult<T>>
): Promise<T> {
  const result = await action()
  if (!result.ok) throw new Error(result.error)
  return result.data as T
}

'use client'

import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'

export type OptimisticResult =
  | { ok: true; message?: string }
  | { ok: false; error: string }

type RunOptimisticOptions<T extends { id: string }> = {
  current: T
  optimistic: T
  apply: (item: T) => void
  action: () => Promise<OptimisticResult>
  onSuccess?: (result: Extract<OptimisticResult, { ok: true }>) => void
  onError?: (message: string) => void
  onNetworkError?: (message: string) => void
}

type SkippedContext = { skipped: true; previous?: never }
type AppliedContext = { skipped: false; previous?: unknown }
type MutationContext = SkippedContext | AppliedContext | undefined

/**
 * Mecânica compartilhada de clique otimista usada em tarefas/recompensas/
 * conquistas: pending por item, aplicação do otimista antes do `await`,
 * rollback em erro e limpeza no `finally` — agora sobre `useMutation` do
 * TanStack Query.
 *
 * `markServer(id)` é chamado quando a linha real chega pelo Realtime — a
 * partir daí o cache tem a verdade do servidor e qualquer rollback tardio de
 * uma mutação em voo é **ignorado** (precedência absoluta do Realtime).
 * `optimisticIdsRef` é exportado para compatibilidade com os call-sites
 * existentes; `serverAckedRef` é o flag canônico de "acked" usado internamente.
 */
export function useOptimisticAction() {
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const pendingIdsRef = useRef<Set<string>>(new Set())
  const optimisticIdsRef = useRef<Set<string>>(new Set())
  const serverAckedRef = useRef<Set<string>>(new Set())

  function addPendingId(id: string) {
    pendingIdsRef.current.add(id)
    setPendingIds((prev) => new Set(prev).add(id))
  }

  function removePendingId(id: string) {
    pendingIdsRef.current.delete(id)
    setPendingIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const mutation = useMutation<
    OptimisticResult,
    Error,
    RunOptimisticOptions<{ id: string }>,
    MutationContext
  >({
    mutationFn: (vars) => vars.action(),
    onMutate: (vars) => {
      const id = vars.current.id
      if (pendingIdsRef.current.has(id)) {
        return { skipped: true } satisfies SkippedContext
      }
      addPendingId(id)
      // Mutação original: limpa ack de invocações anteriores do mesmo item.
      serverAckedRef.current.delete(id)
      optimisticIdsRef.current.add(id)
      vars.apply(vars.optimistic)
      return { skipped: false, previous: vars.current } satisfies AppliedContext
    },
    onSuccess: (result, vars, context) => {
      if (context?.skipped) return
      if (!result.ok) {
        rollbackSnapshot(vars.current.id, context, vars.apply)
        vars.onError?.(result.error)
        return
      }
      vars.onSuccess?.(result)
    },
    onError: (_error, vars, context) => {
      if (context?.skipped) return
      rollbackSnapshot(vars.current.id, context, vars.apply)
      vars.onNetworkError?.('Falha de conexão. Tente novamente.')
    },
    onSettled: (_data, _error, vars, context) => {
      if (context?.skipped) return
      removePendingId(vars.current.id)
      optimisticIdsRef.current.delete(vars.current.id)
      serverAckedRef.current.delete(vars.current.id)
    },
  })

  function isPending(id: string) {
    return pendingIds.has(id)
  }

  function markServer(id: string) {
    // Realtime confirmou a linha — não permitir que o rollback recoloque o
    // snapshot antigo por cima dela.
    serverAckedRef.current.add(id)
    optimisticIdsRef.current.delete(id)
  }

  function rollbackSnapshot<T extends { id: string }>(
    id: string,
    context: MutationContext,
    apply: (item: T) => void
  ) {
    // Precedência do Realtime: se o servidor já confirmou esta mutação
    // (markServer foi chamado), não tocar no cache.
    if (serverAckedRef.current.has(id)) return
    if (!context || context.skipped) return
    // O snapshot pré-otimista veio do onMutate — não dependemos de
    // `optimisticIdsRef` ter sobrevivido até aqui.
    apply(context.previous as T)
  }

  async function runOptimistic<T extends { id: string }>({
    current,
    optimistic,
    apply,
    action,
    onSuccess,
    onError,
    onNetworkError,
  }: RunOptimisticOptions<T>) {
    try {
      await mutation.mutateAsync({
        current,
        optimistic,
        apply,
        action,
        onSuccess,
        onError,
        onNetworkError,
      } as unknown as RunOptimisticOptions<{ id: string }>)
    } catch {
      // onError já tratou rollback/toast; engolir evita rejections não tratadas.
    }
  }

  return {
    pendingIds,
    isPending,
    markServer,
    optimisticIdsRef,
    runOptimistic,
  }
}

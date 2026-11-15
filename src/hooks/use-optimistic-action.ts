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

type SkippedContext = { skipped: true }
type AppliedContext = { skipped: false }
type MutationContext = SkippedContext | AppliedContext | undefined

/**
 * Mecânica compartilhada de clique otimista usada em tarefas/recompensas/
 * conquistas: pending por item, aplicação do otimista antes do `await`,
 * rollback em erro e limpeza no `finally` — agora sobre `useMutation` do
 * TanStack Query.
 *
 * `markServer` existe para o Realtime: quando a linha real chega, o id sai do
 * registro de otimistas para que um rollback atrasado não sobrescreva o dado
 * novo. `optimisticIdsRef` é lido pelo Realtime → invalidate-ish.
 */
export function useOptimisticAction() {
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const pendingIdsRef = useRef<Set<string>>(new Set())
  const optimisticIdsRef = useRef<Set<string>>(new Set())

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
      optimisticIdsRef.current.add(id)
      vars.apply(vars.optimistic)
      return { skipped: false } satisfies AppliedContext
    },
    onSuccess: (result, vars, context) => {
      if (context?.skipped) return
      if (!result.ok) {
        rollbackOptimistic(vars.current.id, vars.current, vars.apply)
        vars.onError?.(result.error)
        return
      }
      vars.onSuccess?.(result)
    },
    onError: (_error, vars, context) => {
      if (context?.skipped) return
      rollbackOptimistic(vars.current.id, vars.current, vars.apply)
      vars.onNetworkError?.('Falha de conexão. Tente novamente.')
    },
    onSettled: (_data, _error, vars, context) => {
      if (context?.skipped) return
      removePendingId(vars.current.id)
      optimisticIdsRef.current.delete(vars.current.id)
    },
  })

  function isPending(id: string) {
    return pendingIds.has(id)
  }

  function markServer(id: string) {
    optimisticIdsRef.current.delete(id)
  }

  function rollbackOptimistic<T extends { id: string }>(
    id: string,
    current: T,
    apply: (item: T) => void
  ) {
    if (!optimisticIdsRef.current.has(id)) return
    apply(current)
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

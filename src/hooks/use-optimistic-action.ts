'use client'

import { useRef, useState } from 'react'

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

/**
 * Mecânica compartilhada de clique otimista usada em tarefas e recompensas:
 * pending por item, aplicação do otimista antes do `await`, rollback em erro e
 * limpeza no `finally`.
 *
 * `markServer` existe para o Realtime: quando a linha real chega, o id sai do
 * registro de otimistas para que um rollback atrasado não sobrescreva o dado
 * novo. `optimisticIdsRef` é lido pelo efeito que sincroniza a prop do servidor.
 */
export function useOptimisticAction() {
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const pendingIdsRef = useRef<Set<string>>(new Set())
  const optimisticIdsRef = useRef<Set<string>>(new Set())

  function setPendingId(id: string, on: boolean) {
    if (on) pendingIdsRef.current.add(id)
    else pendingIdsRef.current.delete(id)
    setPendingIds((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

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
    const id = current.id
    if (pendingIdsRef.current.has(id)) return

    setPendingId(id, true)
    optimisticIdsRef.current.add(id)
    apply(optimistic)

    try {
      const result = await action()
      if (!result.ok) {
        rollbackOptimistic(id, current, apply)
        onError?.(result.error)
        return
      }
      onSuccess?.(result)
    } catch {
      rollbackOptimistic(id, current, apply)
      onNetworkError?.('Falha de conexão. Tente novamente.')
    } finally {
      setPendingId(id, false)
      optimisticIdsRef.current.delete(id)
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
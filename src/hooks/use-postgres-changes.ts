'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'

type ChangeEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*'

type UsePostgresChangesOptions<T extends { id: string }> = {
  /** Tabela do schema `public` (ex.: 'tasks'). */
  table: string
  /**
   * Filtro do Realtime, ex.: `house_id=eq.abc`. Funciona como um índice de
   * origem: a publicação envia toda mudança da tabela que "bate" no filter,
   * e o RLS ainda estreita o que o assinante AUTORIZA ver. Ou seja, o
   * filter de casa + policy SELECT por `house_id` = isolamento multi-tenant
   * de verdade mesmo com uma única channel compartilhada.
   */
  filter?: string
  event?: ChangeEvent
  onUpsert?: (row: T) => void
  onDelete?: (id: string) => void
}

/**
 * Assina mudanças (INSERT/UPDATE/DELETE) de uma tabela via `postgres_changes`.
 *
 * ENSINO (teach) — como o Realtime funciona aqui:
 *  1. `supabase.channel(nome)` cria um canal de broadcast.
 *  2. `.on('postgres_changes', {...})` registra a assinatura do WAL do
 *     Postgres (a tabela precisa estar na publication `supabase_realtime`).
 *  3. `.subscribe()` conecta via WebSocket. O payload chega em tempo real
 *     para TODOS os clientes conectados que satisfazem o filter E o RLS.
 *  4. No cleanup removemos o canal — vital para evitar vazamento de
 *     listeners quando o componente desmonta ou o usuário troca de casa.
 *
 * Manter o `supabase` criado DENTRO do useEffect evita assinaturas
 * duplicadas em re-renders (cada montagem = um canal).
 */
export function usePostgresChanges<T extends { id: string }>({
  table,
  filter,
  event = '*',
  onUpsert,
  onDelete,
}: UsePostgresChangesOptions<T>) {
  const handlers = useRef({ onUpsert, onDelete })

  // Mantém handlers sempre atuais SEM recriar o canal a cada render.
  useEffect(() => {
    handlers.current = { onUpsert, onDelete }
  })

  useEffect(() => {
    const supabase = createClient()

    const channel = supabase.channel(`pg-changes:${table}:${filter ?? 'all'}`)

    channel
      .on(
        'postgres_changes',
        {
          event,
          schema: 'public',
          table,
          ...(filter ? { filter } : {}),
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            handlers.current.onDelete?.(payload.old?.id as string)
            return
          }
          handlers.current.onUpsert?.(payload.new as T)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [table, filter, event])
}
'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'

type ChangeEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*'

type UsePostgresChangesOptions<T extends { id: string }> = {
  table: string
  filter?: string
  event?: ChangeEvent
  onUpsert?: (row: T) => void
  onDelete?: (id: string) => void
}

export function usePostgresChanges<T extends { id: string }>({
  table,
  filter,
  event = '*',
  onUpsert,
  onDelete,
}: UsePostgresChangesOptions<T>) {
  const handlers = useRef({ onUpsert, onDelete })
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)
  const subscribedRef = useRef(false)

  useEffect(() => {
    handlers.current = { onUpsert, onDelete }
  })

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    // Nome único por montagem para evitar colisão com canais anteriores
    const channelName = `pg-changes:${table}:${filter ?? 'all'}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`

    async function setupChannel() {
      try {
        // 1. Garante sessão atualizada antes de criar canal
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) {
          console.warn('[Realtime] Sem sessão válida, pulando subscription')
          return
        }

        // 2. Define auth no realtime ANTES de criar canal
        await supabase.realtime.setAuth(session.access_token)
        if (cancelled) return

        // 3. Remove canal anterior se existir (cleanup defensivo)
        if (channelRef.current) {
          try {
            await supabase.removeChannel(channelRef.current)
          } catch {
            // ignora erro de canal já removido
          }
          channelRef.current = null
          subscribedRef.current = false
        }

        // 4. Cria canal com callbacks JÁ anexados (antes do subscribe)
        const channel = supabase
          .channel(channelName)
          .on(
            'postgres_changes',
            { event, schema: 'public', table, ...(filter ? { filter } : {}) },
            (payload) => {
              if (cancelled) return
              if (payload.eventType === 'DELETE') {
                handlers.current.onDelete?.(payload.old?.id as string)
              } else {
                handlers.current.onUpsert?.(payload.new as T)
              }
            }
          )

        channelRef.current = channel

        // 5. Subscribe por último
        channel.subscribe((status) => {
          if (cancelled) return
          if (status === 'SUBSCRIBED') {
            subscribedRef.current = true
            console.log(`[Realtime] Conectado: ${table}${filter ? ` (${filter})` : ''}`)
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            console.warn(`[Realtime] Status: ${status} para ${table}`)
            subscribedRef.current = false
          }
        })
      } catch (err) {
        if (!cancelled) console.error('[Realtime] Erro ao configurar:', err)
      }
    }

    void setupChannel()

    return () => {
      cancelled = true
      // Cleanup síncrono imediato
      const ch = channelRef.current
      channelRef.current = null
      subscribedRef.current = false
      if (ch) {
        // removeChannel é assíncrono mas não await aqui para não bloquear unmount
        void supabase.removeChannel(ch)
      }
    }
  }, [table, filter, event])
}
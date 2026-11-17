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

const MAX_RETRY_DELAY_MS = 30_000

/**
 * Subscription Realtime com reconexão automática e backoff exponencial com
 * jitter. Cada instância do efeito cria seu próprio canal; o cleanup sempre
 * aguarda `removeChannel` antes de recriar — nunca toca em canais alheios.
 */
export function usePostgresChanges<T extends { id: string }>({
  table,
  filter,
  event = '*',
  onUpsert,
  onDelete,
}: UsePostgresChangesOptions<T>) {
  const handlers = useRef({ onUpsert, onDelete })
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)
  const cancelledRef = useRef(false)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const attemptRef = useRef(0)

  useEffect(() => {
    handlers.current = { onUpsert, onDelete }
  })

  useEffect(() => {
    cancelledRef.current = false
    attemptRef.current = 0
    const supabase = createClient()

    function clearRetryTimer() {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
      }
    }

    function backoffDelay(attempt: number): number {
      const base = Math.min(1000 * Math.pow(2, attempt), MAX_RETRY_DELAY_MS)
      const jitter = Math.floor(Math.random() * 500)
      return base + jitter
    }

    async function removeCurrentChannel() {
      const channel = channelRef.current
      channelRef.current = null
      if (!channel) return
      try {
        await supabase.removeChannel(channel)
      } catch {
        // ignora erro de canal já removido
      }
    }

    async function connect() {
      if (cancelledRef.current) return

      // 1. Sessão atualizada antes de criar canal
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (cancelledRef.current) return
      if (!session?.access_token) {
        console.warn('[Realtime] Sem sessão válida, pulando subscription')
        return
      }

      // 2. Define auth no realtime ANTES de criar canal
      await supabase.realtime.setAuth(session.access_token)
      if (cancelledRef.current) return

      // 3. Remove o canal desta instância do efeito (se houver)
      await removeCurrentChannel()
      if (cancelledRef.current) return

      // 4. Sufixo novo por tentativa — evita colisões
      const suffix = `${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`
      const channel = supabase
        .channel(`pg-changes:${table}:${filter ?? 'all'}:${suffix}`)
        .on(
          'postgres_changes',
          { event, schema: 'public', table, ...(filter ? { filter } : {}) },
          (payload) => {
            if (cancelledRef.current) return
            if (payload.eventType === 'DELETE') {
              const id = payload.old?.id
              if (typeof id !== 'string') {
                console.warn('[Realtime] DELETE sem id válido, ignorando:', payload.old)
                return
              }
              handlers.current.onDelete?.(id)
            } else {
              const row = payload.new as unknown as Record<string, unknown> | undefined
              if (!row || typeof row.id !== 'string') {
                console.warn('[Realtime] payload.new sem id, ignorando:', payload.new)
                return
              }
              handlers.current.onUpsert?.(row as unknown as T)
            }
          }
        )

      channelRef.current = channel

      channel.subscribe((status) => {
        if (cancelledRef.current) return
        if (status === 'SUBSCRIBED') {
          attemptRef.current = 0
          console.log(
            `[Realtime] Conectado: ${table}${filter ? ` (${filter})` : ''}`
          )
          return
        }
        if (
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT' ||
          status === 'CLOSED'
        ) {
          console.warn(`[Realtime] Status: ${status} para ${table} — tentando reconectar`)
          scheduleReconnect()
        }
      })
    }

    function scheduleReconnect() {
      clearRetryTimer()
      const attempt = attemptRef.current
      attemptRef.current = attempt + 1
      const delay = backoffDelay(attempt)
      retryTimerRef.current = setTimeout(() => {
        if (cancelledRef.current) return
        void connect()
      }, delay)
    }

    void (async () => {
      try {
        await connect()
      } catch (err) {
        if (!cancelledRef.current) {
          console.error('[Realtime] Erro ao configurar:', err)
          scheduleReconnect()
        }
      }
    })()

    return () => {
      cancelledRef.current = true
      clearRetryTimer()
      void removeCurrentChannel()
    }
  }, [table, filter, event])
}

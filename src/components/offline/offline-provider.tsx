'use client'

import { useCallback, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useOnline } from '@/hooks/use-online'
import { usePendingSync } from '@/hooks/use-pending-sync'
import { refreshOfflineSnapshot } from '@/lib/offline/snapshot'
import { cn } from '@/lib/utils'

/**
 * Shell offline: banner de status + drenagem automatica da fila.
 *
 * Nao busca dados nem grava snapshot (Fase 2). Apenas observa a conexao,
 * sincroniza o que estiver na outbox e atualiza a tela quando algo foi enviado.
 */
export function OfflineProvider() {
  const online = useOnline()
  const { count, flushing, lastResult, flush } = usePendingSync()
  const router = useRouter()
  const pathname = usePathname()

  const isAuthRoute =
    pathname.startsWith('/login') || pathname.startsWith('/register')

  const runFlush = useCallback(async () => {
    const summary = await flush()
    if (summary.removed > 0) router.refresh()
  }, [flush, router])

  const wasOnline = useRef(online)
  const didMount = useRef(false)

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true
      wasOnline.current = online
      if (online) {
        void runFlush()
        void refreshOfflineSnapshot()
      }
      return
    }

    if (online && !wasOnline.current) {
      void runFlush()
      void refreshOfflineSnapshot()
    }
    wasOnline.current = online
  }, [online, runFlush])

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void runFlush()
        void refreshOfflineSnapshot()
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [runFlush])

  useEffect(() => {
    if (!lastResult) return

    if (lastResult.status === 'unauthorized') {
      toast.error('Sessão expirada. Entre novamente para sincronizar.')
      return
    }

    if (lastResult.conflicts.length > 0) {
      toast.error('Algumas alterações não puderam ser sincronizadas.')
      return
    }

    if (lastResult.status === 'error' && lastResult.errors.length > 0) {
      toast.error('Falha ao sincronizar. Tentaremos novamente.')
    }
  }, [lastResult])

  if (isAuthRoute) return null

  const offline = !online
  const showPending = count > 0

  if (!offline && !showPending) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'fixed left-1/2 z-[60] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-xl border px-3 py-2 text-xs font-medium shadow-lg backdrop-blur-sm',
        'bottom-[calc(4.75rem+env(safe-area-inset-bottom))] md:bottom-4',
        offline
          ? 'border-amber-300 bg-amber-50/95 text-amber-900'
          : 'border-blue-200 bg-white/95 text-slate-700'
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span>
          {offline
            ? showPending
              ? `Sem conexão — ${count} alteração(ões) aguardando envio.`
              : 'Sem conexão — alterações serão enviadas depois.'
            : flushing
              ? 'Sincronizando alterações…'
              : `${count} alteração(ões) pendente(s).`}
        </span>

        {!offline && showPending ? (
          <button
            type="button"
            onClick={() => void runFlush()}
            disabled={flushing}
            className="shrink-0 rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
          >
            {flushing ? 'Enviando…' : 'Sincronizar'}
          </button>
        ) : null}
      </div>
    </div>
  )
}

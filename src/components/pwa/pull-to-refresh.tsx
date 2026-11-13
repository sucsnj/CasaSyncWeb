'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { Capacitor } from '@capacitor/core'
import { queryScopeForPath } from '@/lib/query-keys'

/**
 * Gesto de "arrastar para baixo" que atualiza a tela — só no app nativo
 * (Capacitor), onde não existe o pull-to-refresh do browser.
 *
 * **O que ele atualiza:**
 * 1. o cache da rota ativa (`invalidateQueries` do escopo) — as listas que
 *    migraram para o React Query revalidam em segundo plano, sem recarregar a
 *    página e sem perder o cache das outras telas;
 * 2. o shell do servidor (`router.refresh()`) — badges da nav, ícone de castigo,
 *    comunicados e sino continuam sendo renderizados no servidor.
 *
 * Antes disso era `window.location.reload()`, que limpava o cache inteiro da
 * sessão a cada gesto (e recarregava a webview).
 */
export function PullToRefresh() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const startY = useRef<number | null>(null)
  const pullingRef = useRef(false)
  const [pulling, setPulling] = useState(false)

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    function handleTouchStart(event: TouchEvent) {
      if (window.scrollY === 0 && event.touches.length === 1) {
        startY.current = event.touches[0].clientY
      }
    }

    function handleTouchMove(event: TouchEvent) {
      if (startY.current === null) return
      const delta = event.touches[0].clientY - startY.current
      if (delta > 80 && !pullingRef.current) {
        pullingRef.current = true
        setPulling(true)
      }
    }

    async function handleTouchEnd() {
      const shouldRefresh = pullingRef.current
      pullingRef.current = false
      startY.current = null
      if (!shouldRefresh) return

      const scope = queryScopeForPath(window.location.pathname)
      if (scope) {
        await queryClient.invalidateQueries({ queryKey: [scope] })
      }
      // O shell é renderizado no servidor: só ele precisa do refresh.
      router.refresh()
      setPulling(false)
    }

    document.addEventListener('touchstart', handleTouchStart, { passive: true })
    document.addEventListener('touchmove', handleTouchMove, { passive: true })
    document.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
    }
  }, [queryClient, router])

  if (!pulling) return null

  return (
    <div className="fixed inset-x-0 top-0 z-[200] flex justify-center py-3">
      <div className="rounded-full bg-white/90 px-4 py-1.5 text-sm font-medium text-slate-700 shadow-md backdrop-blur-sm">
        Atualizando…
      </div>
    </div>
  )
}

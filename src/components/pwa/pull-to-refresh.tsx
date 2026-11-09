'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Capacitor } from '@capacitor/core'
import { Loader2, RefreshCw } from 'lucide-react' // ou outro ícone de spinner

export function PullToRefresh() {
  const router = useRouter()
  const startY = useRef<number | null>(null)
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const isRefreshingRef = useRef(false)

  const THRESHOLD = 90 // Distância em pixels para disparar o refresh

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    function handleTouchStart(event: TouchEvent) {
      if ((window.scrollY === 0 || document.documentElement.scrollTop === 0) && event.touches.length === 1) {
        startY.current = event.touches[0].clientY
      }
    }

    function handleTouchMove(event: TouchEvent) {
      if (startY.current === null || isRefreshingRef.current) return

      const currentY = event.touches[0].clientY
      const delta = currentY - startY.current

      if (delta > 0) {
        // Aplica resistência ao arrastar (amortecimento)
        const distance = Math.min(delta * 0.5, THRESHOLD + 20)
        setPullDistance(distance)
      }
    }

    function handleTouchEnd() {
      if (startY.current === null) return

      if (pullDistance >= THRESHOLD && !isRefreshingRef.current) {
        isRefreshingRef.current = true
        setIsRefreshing(true)
        setPullDistance(THRESHOLD)

        // Executa a atualização do Next.js
        router.refresh()

        // Simula o tempo do indicador girando antes de recolher
        setTimeout(() => {
          setIsRefreshing(false)
          isRefreshingRef.current = false
          setPullDistance(0)
        }, 1200)
      } else {
        setPullDistance(0)
      }

      startY.current = null
    }

    document.addEventListener('touchstart', handleTouchStart, { passive: true })
    document.addEventListener('touchmove', handleTouchMove, { passive: true })
    document.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
    }
  }, [pullDistance, router])

  if (pullDistance === 0 && !isRefreshing) return null

  // Calcula a rotação da seta conforme o usuário arrasta para baixo
  const progress = Math.min(pullDistance / THRESHOLD, 1)
  const rotation = progress * 180

  return (
    <div
      className="fixed inset-x-0 top-0 z-[200] flex justify-center transition-transform duration-75 ease-out pointer-events-none"
      style={{
        transform: `translateY(${pullDistance}px)`,
      }}
    >
      {/* Círculo branco clássico do Android com sombra nativa */}
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-md border border-slate-100">
        {isRefreshing ? (
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
        ) : (
          <RefreshCw
            className="h-5 w-5 text-slate-600 transition-transform duration-75"
            style={{ transform: `rotate(${rotation}deg)` }}
          />
        )}
      </div>
    </div>
  )
}
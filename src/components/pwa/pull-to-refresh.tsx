'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { Capacitor } from '@capacitor/core'
import { toast } from 'sonner'
import { Loader2, RefreshCw } from 'lucide-react'

export function PullToRefresh() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const startY = useRef<number | null>(null)
  const pullDistanceRef = useRef(0)
  const isRefreshingRef = useRef(false)
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const THRESHOLD = 90

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    function handleTouchStart(event: TouchEvent) {
      if (
        (window.scrollY === 0 || document.documentElement.scrollTop === 0) &&
        event.touches.length === 1
      ) {
        startY.current = event.touches[0].clientY
      }
    }

    function handleTouchMove(event: TouchEvent) {
      if (startY.current === null || isRefreshingRef.current) return

      const currentY = event.touches[0].clientY
      const delta = currentY - startY.current

      if (delta > 0) {
        const distance = Math.min(delta * 0.5, THRESHOLD + 20)
        pullDistanceRef.current = distance
        setPullDistance(distance)
      }
    }

    function handleTouchEnd() {
      if (startY.current === null) return

      const distance = pullDistanceRef.current
      startY.current = null

      if (distance >= THRESHOLD && !isRefreshingRef.current) {
        isRefreshingRef.current = true
        setIsRefreshing(true)
        pullDistanceRef.current = THRESHOLD
        setPullDistance(THRESHOLD)

        // Recarrega os dados do app: força refetch de todas as queries do cache
        // (fonte de verdade do local-first) e dos Server Components via router.
        const refreshPromise = queryClient.refetchQueries({ type: 'all' })
        void refreshPromise
          .then(() => {
            toast.success('Dados atualizados')
          })
          .catch((error) => {
            console.error('[PullToRefresh] falha ao atualizar:', error)
            toast.error('Falha ao atualizar dados')
          })
        router.refresh()

        setTimeout(() => {
          setIsRefreshing(false)
          isRefreshingRef.current = false
          pullDistanceRef.current = 0
          setPullDistance(0)
        }, 1200)
      } else {
        pullDistanceRef.current = 0
        setPullDistance(0)
      }
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

  if (pullDistance === 0 && !isRefreshing) return null

  const progress = Math.min(pullDistance / THRESHOLD, 1)
  const rotation = progress * 180

  return (
    <div
      className="fixed inset-x-0 top-0 z-[200] flex justify-center transition-transform duration-75 ease-out pointer-events-none"
      style={{ transform: `translateY(${pullDistance}px)` }}
    >
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
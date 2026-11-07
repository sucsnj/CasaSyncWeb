'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Capacitor } from '@capacitor/core'

export function PullToRefresh() {
  const router = useRouter()
  const startY = useRef<number | null>(null)
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
      if (delta > 80) {
        setPulling(true)
      }
    }

    function handleTouchEnd() {
      if (pulling) {
        router.refresh()
        setPulling(false)
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
  }, [pulling, router])

  if (!pulling) return null

  return (
    <div className="fixed inset-x-0 top-0 z-[200] flex justify-center py-3">
      <div className="rounded-full bg-white/90 px-4 py-1.5 text-sm font-medium text-slate-700 shadow-md backdrop-blur-sm">
        Atualizando…
      </div>
    </div>
  )
}
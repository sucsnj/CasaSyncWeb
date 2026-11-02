'use client'

import { useCallback, useEffect, useState } from 'react'

const HEARTBEAT_INTERVAL_MS = 30_000
const HEARTBEAT_TIMEOUT_MS = 4_000

/**
 * Online real (nao so `navigator.onLine`): combina os eventos online/offline
 * com um heartbeat curto em `/api/health`. Roda no browser e no WebView.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true)

  const check = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setOnline(false)
      return
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), HEARTBEAT_TIMEOUT_MS)

    try {
      const response = await fetch('/api/health', {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      })
      setOnline(response.ok || response.status === 204)
    } catch {
      setOnline(false)
    } finally {
      clearTimeout(timeout)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const safeCheck = () => {
      if (!cancelled) void check()
    }

    const onOnline = () => {
      setOnline(true)
      safeCheck()
    }
    const onOffline = () => setOnline(false)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') safeCheck()
    }

    safeCheck()

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    document.addEventListener('visibilitychange', onVisibility)

    const interval = window.setInterval(safeCheck, HEARTBEAT_INTERVAL_MS)

    return () => {
      cancelled = true
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearInterval(interval)
    }
  }, [check])

  return online
}

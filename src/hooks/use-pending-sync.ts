'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  flushQueue,
  pendingCount,
  subscribePending,
  type FlushSummary,
} from '@/lib/offline/queue'

export function usePendingSync() {
  const [count, setCount] = useState(0)
  const [flushing, setFlushing] = useState(false)
  const [lastResult, setLastResult] = useState<FlushSummary | null>(null)

  const refresh = useCallback(async () => {
    setCount(await pendingCount())
  }, [])

  useEffect(() => {
    let cancelled = false

    const sync = () => {
      void pendingCount().then((next) => {
        if (!cancelled) setCount(next)
      })
    }

    sync()
    const unsubscribe = subscribePending(sync)

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const flush = useCallback(async (): Promise<FlushSummary> => {
    setFlushing(true)
    try {
      const summary = await flushQueue()
      setLastResult(summary)
      return summary
    } finally {
      setFlushing(false)
      await refresh()
    }
  }, [refresh])

  return { count, flushing, lastResult, flush, refresh }
}

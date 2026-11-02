'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  isSnapshotStale,
  readOfflineMeta,
  readSnapshot,
  refreshOfflineSnapshot,
} from '@/lib/offline/snapshot'
import type { OfflineSnapshot, OfflineSnapshotData } from '@/lib/offline/snapshot'

export function useOfflineSnapshot() {
  const [snapshot, setSnapshot] = useState<OfflineSnapshot<OfflineSnapshotData> | null>(
    null
  )
  const [loading, setLoading] = useState(true)
  const [stale, setStale] = useState(false)

  const load = useCallback(async () => {
    const [stored, meta] = await Promise.all([
      readSnapshot<OfflineSnapshotData>(),
      readOfflineMeta(),
    ])
    setSnapshot(stored)
    setStale(stored ? isSnapshotStale(stored) : true)
    setLoading(false)
    return { stored, meta }
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    const next = await refreshOfflineSnapshot()
    if (next) {
      setSnapshot(next)
      setStale(false)
    }
    setLoading(false)
    return next
  }, [])

  useEffect(() => {
    let cancelled = false

    Promise.all([
      readSnapshot<OfflineSnapshotData>(),
      readOfflineMeta(),
    ]).then(([stored]) => {
      if (cancelled) return
      setSnapshot(stored)
      setStale(stored ? isSnapshotStale(stored) : true)
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [])

  return { snapshot, loading, stale, refresh, reload: load }
}

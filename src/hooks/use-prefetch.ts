'use client'

import { useCallback, useState } from 'react'

export type PrefetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string }

type CacheEntry = { data: unknown; error: string | null }

const cache = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<void>>()

export function invalidatePrefetch(key?: string) {
  if (key) {
    cache.delete(key)
    inflight.delete(key)
  } else {
    cache.clear()
    inflight.clear()
  }
}

export function usePrefetch<T>(
  key: string,
  action: () => Promise<PrefetchResult<T>>
) {
  const [state, setState] = useState<{
    data: T | null
    error: string | null
    loading: boolean
  }>(() => {
    const entry = cache.get(key)
    return entry
      ? { data: entry.data as T | null, error: entry.error, loading: false }
      : { data: null, error: null, loading: false }
  })

  const prefetch = useCallback(() => {
    if (cache.has(key) || inflight.has(key)) return
    const promise = action()
      .then((result) => {
        if (result.ok) cache.set(key, { data: result.data, error: null })
        else cache.set(key, { data: null, error: result.error })
      })
      .catch((err) => {
        cache.set(key, {
          data: null,
          error: err instanceof Error ? err.message : 'Falha ao carregar.',
        })
      })
      .finally(() => {
        inflight.delete(key)
      })
    inflight.set(key, promise)
  }, [key, action])

  const load = useCallback(async () => {
    const entry = cache.get(key)
    if (entry) {
      setState({ data: entry.data as T | null, error: entry.error, loading: false })
      return
    }
    const pending = inflight.get(key)
    if (pending) {
      setState((current) => ({ ...current, loading: true }))
      await pending
      const resolved = cache.get(key)
      setState({
        data: (resolved?.data as T | null) ?? null,
        error: resolved?.error ?? null,
        loading: false,
      })
      return
    }
    setState((current) => ({ ...current, loading: true }))
    const result = await action()
    if (result.ok) {
      cache.set(key, { data: result.data, error: null })
      setState({ data: result.data, error: null, loading: false })
    } else {
      cache.set(key, { data: null, error: result.error })
      setState({ data: null, error: result.error, loading: false })
    }
  }, [key, action])

  return { ...state, prefetch, load }
}
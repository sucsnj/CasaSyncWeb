'use client'

import { useCallback, useState } from 'react'

export function usePersistedSort(key: string, defaultValue: string) {
  const [value, setValue] = useState(() => {
    if (typeof window === 'undefined') return defaultValue
    try {
      return window.localStorage.getItem(key) ?? defaultValue
    } catch {
      return defaultValue
    }
  })

  const set = useCallback((next: string) => {
    setValue(next)
    try {
      window.localStorage.setItem(key, next)
    } catch {
      // ignore
    }
  }, [key])

  return [value, set] as const
}
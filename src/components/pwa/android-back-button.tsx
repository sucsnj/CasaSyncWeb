'use client'

import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'

export function AndroidBackButton() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    let remove: (() => void) | undefined

    void (async () => {
      const { App } = await import('@capacitor/app')
      const handle = await App.addListener('backButton', ({ canGoBack }) => {
        const path = window.location.pathname
        const isRoot =
          path === '/' ||
          path === '/login' ||
          /^\/dashboard\/[^/]+$/.test(path) ||
          path === '/tasks' ||
          path === '/rewards' ||
          path === '/achievements' ||
          path === '/chest'

        console.log('[BACK] path=', path, 'canGoBack=', canGoBack, 'isRoot=', isRoot)

        if (isRoot || !canGoBack) {
          App.exitApp()
        } else {
          window.history.back()
        }
      })
      remove = () => {
        void handle.remove()
      }
    })()

    return () => {
      remove?.()
    }
  }, [])

  return null
}
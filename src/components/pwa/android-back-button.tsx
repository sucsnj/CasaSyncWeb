'use client'

import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'

export function AndroidBackButton() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    let remove: (() => void) | undefined

    void (async () => {
      try {
        const { App } = await import('@capacitor/app')
        console.log('[BACK] registering listener')
        const handle = await App.addListener('backButton', ({ canGoBack }) => {
          const path = window.location.pathname.replace(/\/$/, '')
          const isDefaultRoute =
            path === '' ||
            path === '/' ||
            path === '/dashboard/admin' ||
            path === '/dashboard/dependent'

          console.log('[BACK] path=', path, 'canGoBack=', canGoBack, 'isDefaultRoute=', isDefaultRoute)

          if (isDefaultRoute) {
            App.exitApp()
          } else if (canGoBack) {
            window.history.back()
          } else {
            App.exitApp()
          }
        })
        remove = () => {
          void handle.remove()
        }
      } catch (err) {
        console.error('[BACK] failed to register', err)
      }
    })()

    return () => {
      remove?.()
    }
  }, [])

  return null
}
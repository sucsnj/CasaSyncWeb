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
        if (canGoBack) {
          window.history.back()
        } else {
          App.exitApp()
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
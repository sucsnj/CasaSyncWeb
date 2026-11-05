'use client'

import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'

export function NativeServiceWorkerGuard() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((reg) => reg.unregister())
    })
  }, [])
  return null
}
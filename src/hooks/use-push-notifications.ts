'use client'

import { useEffect } from 'react'
import { subscribeToPush, subscriptionToJSON } from '@/utils/push'
import { registerPushSubscription, unregisterAllPushSubscriptions } from '@/actions/push'

export function usePushNotifications(userId: string | undefined) {
  useEffect(() => {
    if (!userId || typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return
    }

    let mounted = true

    async function setupPush() {
      try {
        const registration = await navigator.serviceWorker.ready
        const subscription = await subscribeToPush(registration)

        if (!mounted) return

        if (subscription) {
          const subJson = subscriptionToJSON(subscription)
          const result = await registerPushSubscription(
            subJson.endpoint,
            subJson.keys.p256dh,
            subJson.keys.auth,
            navigator.userAgent
          )
          if (!result.ok) {
            console.warn('Failed to register push subscription:', result.error)
          }
        }
      } catch (err) {
        console.error('Push setup error:', err)
      }
    }

    // Pede permissão e subscreve se concedida
    if (Notification.permission === 'default') {
      Notification.requestPermission().then((permission) => {
        if (permission === 'granted') {
          setupPush()
        }
      })
    } else if (Notification.permission === 'granted') {
      setupPush()
    }

    return () => {
      mounted = false
    }
  }, [userId])

  // Função para o usuário desativar push manualmente (ex: nas configurações)
  async function disablePush() {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        await subscription.unsubscribe()
      }
      await unregisterAllPushSubscriptions()
    } catch (err) {
      console.error('Disable push error:', err)
    }
  }

  return { disablePush }
}
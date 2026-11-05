'use client'

import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { registerPushSubscription, registerPushToken } from '@/actions/push'

export function usePushNotifications(userId: string | undefined) {
  useEffect(() => {
    if (!userId || typeof window === 'undefined') return

    let mounted = true

    if (Capacitor.isNativePlatform()) {
      void (async () => {
        const { PushNotifications } = await import('@capacitor/push-notifications')
        const perm = await PushNotifications.requestPermissions()
        if (!mounted || perm.receive !== 'granted') return

        await PushNotifications.register()

        PushNotifications.addListener('registration', async (token) => {
          if (!mounted) return
          await registerPushToken('FCM_NATIVE', token.value)
        })

        PushNotifications.addListener('pushNotificationReceived', (notification) => {
          console.log('FCM received:', notification)
        })
      })()

      return () => {
        mounted = false
      }
    }

    // Web Push (fluxo existente)
    if (!('serviceWorker' in navigator)) return

    async function setupPush() {
      try {
        const registration = await navigator.serviceWorker.ready
        const { subscribeToPush, subscriptionToJSON } = await import('@/utils/push')
        const subscription = await subscribeToPush(registration)
        if (!mounted || !subscription) return
        const subJson = subscriptionToJSON(subscription)
        await registerPushSubscription(
          subJson.endpoint,
          subJson.keys.p256dh,
          subJson.keys.auth,
          navigator.userAgent
        )
      } catch (err) {
        console.error('Push setup error:', err)
      }
    }

    if (Notification.permission === 'granted') {
      void setupPush()
    }

    return () => {
      mounted = false
    }
  }, [userId])

  async function enablePush(): Promise<boolean> {
    if (typeof window === 'undefined') return false

    if (Capacitor.isNativePlatform()) {
      const { PushNotifications } = await import('@capacitor/push-notifications')
      const perm = await PushNotifications.requestPermissions()
      if (perm.receive !== 'granted') return false
      await PushNotifications.register()
      return true
    }

    if (!('serviceWorker' in navigator)) return false
    try {
      if (Notification.permission !== 'granted') {
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') return false
      }
      const registration = await navigator.serviceWorker.ready
      const { subscribeToPush, subscriptionToJSON } = await import('@/utils/push')
      const subscription = await subscribeToPush(registration)
      if (!subscription) return false
      const subJson = subscriptionToJSON(subscription)
      const result = await registerPushSubscription(
        subJson.endpoint,
        subJson.keys.p256dh,
        subJson.keys.auth,
        navigator.userAgent
      )
      return result.ok
    } catch (err) {
      console.error('Enable push error:', err)
      return false
    }
  }

  async function disablePush() {
    if (typeof window === 'undefined') return
    if (Capacitor.isNativePlatform()) {
      const { PushNotifications } = await import('@capacitor/push-notifications')
      await PushNotifications.removeAllListeners()
      return
    }
    if (!('serviceWorker' in navigator)) return
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) await subscription.unsubscribe()
      const { unregisterAllPushSubscriptions } = await import('@/actions/push')
      await unregisterAllPushSubscriptions()
    } catch (err) {
      console.error('Disable push error:', err)
    }
  }

  return { enablePush, disablePush }
}
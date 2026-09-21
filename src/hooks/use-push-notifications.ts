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

    // Só subscreve se a permissão JÁ está concedida. O pedido de permissão
    // acontece no botão do PushPermissionPrompt (gesto real do usuário) —
    // no Android, requestPermission() fora de gesto é auto-negado em silêncio.
    if (Notification.permission === 'granted') {
      setupPush()
    }

    return () => {
      mounted = false
    }
  }, [userId])

  // Pede permissão (exige gesto) e subscreve/registra assim que concedida.
  // Chamado pelo botão "Ativar" do PushPermissionPrompt.
  async function enablePush(): Promise<boolean> {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return false

    try {
      if (Notification.permission !== 'granted') {
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') return false
      }

      const registration = await navigator.serviceWorker.ready
      const subscription = await subscribeToPush(registration)

      if (!subscription) return false

      const subJson = subscriptionToJSON(subscription)
      const result = await registerPushSubscription(
        subJson.endpoint,
        subJson.keys.p256dh,
        subJson.keys.auth,
        navigator.userAgent
      )
      if (!result.ok) {
        console.warn('Failed to register push subscription:', result.error)
        return false
      }
      return true
    } catch (err) {
      console.error('Enable push error:', err)
      return false
    }
  }

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

  return { enablePush, disablePush }
}
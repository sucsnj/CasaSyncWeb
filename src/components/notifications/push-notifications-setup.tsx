'use client'

import { usePushNotifications } from '@/hooks/use-push-notifications'

export function PushNotificationsSetup({ userId }: { userId: string | undefined }) {
  usePushNotifications(userId)
  return null
}
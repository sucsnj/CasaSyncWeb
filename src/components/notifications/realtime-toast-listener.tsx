'use client'

import { toast } from 'sonner'
import { usePostgresChanges } from '@/hooks/use-postgres-changes'
import type { NotificationRow } from '@/types/notifications'

const TYPE_STYLE: Record<string, 'success' | 'error' | 'info' | 'warning'> = {
  TASK_CREATED: 'info',
  TASK_COMPLETED: 'info',
  TASK_APPROVED: 'success',
  TASK_REJECTED: 'warning',
  TASK_NOT_DELIVERED: 'error',
  TASK_RESTORED: 'info',
  EXTENSION_REQUESTED: 'info',
  EXTENSION_APPROVED: 'success',
  EXTENSION_REJECTED: 'error',
  REWARD_CREATED: 'info',
  REDEMPTION_REQUESTED: 'info',
  REDEMPTION_APPROVED: 'success',
  REDEMPTION_REJECTED: 'error',
  SUGGESTION_CREATED: 'info',
  SUGGESTION_APPROVED: 'success',
  SUGGESTION_REJECTED: 'error',
  QUICK_MESSAGE: 'info',
  PENALTY: 'info',
  COMUNICADO_PUBLISHED: 'info',
}

export function RealtimeToastListener({ userId }: { userId: string }) {
  usePostgresChanges<NotificationRow>({
    table: 'notifications',
    filter: `recipient_id=eq.${userId}`,
    event: 'INSERT',
    onUpsert: (notification) => {
      const style = TYPE_STYLE[notification.type] ?? 'info'

      toast[style](notification.title, {
        description: notification.body,
        duration: 5000,
      })
    },
  })

  return null
}
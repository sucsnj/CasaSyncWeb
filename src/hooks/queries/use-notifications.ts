'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listMyNotifications } from '@/actions/notifications-reads'
import { qk } from '@/lib/query/keys'
import { upsertById } from '@/lib/query/upsert'
import type { NotificationRow } from '@/types/notifications'

export function useNotifications(
  userId: string,
  initialData: NotificationRow[]
) {
  return useQuery({
    queryKey: qk.notifications(userId),
    queryFn: () => listMyNotifications(),
    initialData,
  })
}

export function useNotificationsCache(userId: string) {
  const queryClient = useQueryClient()
  return {
    upsert: (row: NotificationRow) =>
      queryClient.setQueryData<NotificationRow[]>(
        qk.notifications(userId),
        (old) => (old ? upsertById(old, row) : old)
      ),
    remove: (id: string) =>
      queryClient.setQueryData<NotificationRow[]>(
        qk.notifications(userId),
        (old) => old?.filter((item) => item.id !== id)
      ),
    markRead: (id: string) =>
      queryClient.setQueryData<NotificationRow[]>(
        qk.notifications(userId),
        (old) =>
          old?.map((item) =>
            item.id === id && !item.read_at
              ? { ...item, read_at: new Date().toISOString() }
              : item
          )
      ),
    markAllRead: () =>
      queryClient.setQueryData<NotificationRow[]>(
        qk.notifications(userId),
        (old) =>
          old?.map((item) =>
            item.read_at ? item : { ...item, read_at: new Date().toISOString() }
          )
      ),
    clear: () =>
      queryClient.setQueryData<NotificationRow[]>(
        qk.notifications(userId),
        () => []
      ),
  }
}

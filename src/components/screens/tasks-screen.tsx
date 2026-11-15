'use client'

import { useAppSession } from '@/components/session/app-session'
import { NoHouseCard } from '@/components/session/no-house-card'
import { TasksAdmin } from '@/components/tasks/tasks-admin'
import { TasksDependent } from '@/components/tasks/tasks-dependent'

/** Shell cliente de `/tasks`: escolhe a experiência por papel/sessão (0ms). */
export function TasksScreen() {
  const { role, houseId } = useAppSession()

  if (!houseId) return <NoHouseCard role={role} />
  return role === 'ADMIN' ? (
    <TasksAdmin houseId={houseId} />
  ) : (
    <TasksDependent houseId={houseId} />
  )
}

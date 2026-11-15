'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listTasks, type TasksBundle } from '@/actions/tasks-reads'
import { qk } from '@/lib/query/keys'
import { upsertById } from '@/lib/query/upsert'
import type { Tables } from '@/types/database'
import type { ChestItemView } from '@/components/chest/chest-types'

export type Task = Tables<'tasks'>

export function useTasksBundle(houseId: string) {
  return useQuery({
    queryKey: qk.tasks(houseId),
    queryFn: () => listTasks(houseId),
  })
}

export function useInvalidateTasks() {
  const queryClient = useQueryClient()
  return (houseId: string) =>
    queryClient.invalidateQueries({ queryKey: qk.tasks(houseId) })
}

export type TasksBundleUpdater = (bundle: TasksBundle) => TasksBundle

export function patchTasks(
  queryClient: ReturnType<typeof useQueryClient>,
  houseId: string,
  fn: TasksBundleUpdater
) {
  queryClient.setQueryData<TasksBundle>(qk.tasks(houseId), (old) =>
    old ? fn(old) : undefined
  )
}

export function upsertTaskInBundle(
  queryClient: ReturnType<typeof useQueryClient>,
  houseId: string,
  task: Task
) {
  patchTasks(queryClient, houseId, (bundle) => ({
    ...bundle,
    tasks: upsertById(bundle.tasks, task),
  }))
}

export function deleteTaskFromBundle(
  queryClient: ReturnType<typeof useQueryClient>,
  houseId: string,
  taskId: string
) {
  patchTasks(queryClient, houseId, (bundle) => ({
    ...bundle,
    tasks: bundle.tasks.filter((task) => task.id !== taskId),
  }))
}

export function upsertChestItemInBundle(
  queryClient: ReturnType<typeof useQueryClient>,
  houseId: string,
  item: ChestItemView
) {
  patchTasks(queryClient, houseId, (bundle) => ({
    ...bundle,
    chestItems: { ...bundle.chestItems, [item.id]: item },
  }))
}

export function deleteChestItemFromBundle(
  queryClient: ReturnType<typeof useQueryClient>,
  houseId: string,
  itemId: string
) {
  patchTasks(queryClient, houseId, (bundle) => {
    const chestItems = { ...bundle.chestItems }
    delete chestItems[itemId]
    return { ...bundle, chestItems }
  })
}

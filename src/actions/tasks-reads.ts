'use server'

import { createAdminClient } from '@/utils/supabase/admin'
import {
  getHouseAssignees,
  getProfileNames,
} from '@/utils/house'
import { assertHouseAccess } from '@/utils/tenant-scope'
import type { Tables } from '@/types/database'
import type { ChestItemView } from '@/components/chest/chest-types'

type TaskRow = Tables<'tasks'>

export type TasksBundle = {
  role: 'ADMIN' | 'DEPENDENT'
  houseId: string
  tasks: TaskRow[]
  chestItems: Record<string, ChestItemView>
  assignees?: { id: string; full_name: string }[]
  creatorNames?: Record<string, string>
}

async function loadChestItems(
  admin: ReturnType<typeof createAdminClient>,
  rows: TaskRow[]
): Promise<Record<string, ChestItemView>> {
  const ids = [
    ...new Set(
      rows
        .map((task) => task.attachment_chest_item_id)
        .filter((id): id is string => Boolean(id))
    ),
  ]
  if (ids.length === 0) return {}
  const { data } = await admin.from('chest_items').select('*').in('id', ids)
  return Object.fromEntries((data ?? []).map((item) => [item.id, item]))
}

/**
 * Leitura de `/tasks` para o query cache (Fase 2): o bundle é a unidade de
 * invalidação da tela — tarefas + itens do baú espelhados (e, conforme o papel,
 * assignees ou nomes dos tutores). Authorization: sessão + membresia
 * (`assertHouseAccess`) — o mesmo modelo dos reads via service role.
 */
export async function listTasks(houseId: string): Promise<TasksBundle> {
  const access = await assertHouseAccess(houseId)
  if (!access.ok) throw new Error('FORBIDDEN')

  const admin = createAdminClient()

  if (access.role === 'ADMIN') {
    const [{ data: tasks }, assignees] = await Promise.all([
      admin
        .from('tasks')
        .select('*')
        .eq('house_id', houseId)
        .order('created_at', { ascending: false }),
      getHouseAssignees(houseId),
    ])

    const list = tasks ?? []
    const chestItems = await loadChestItems(admin, list)

    return {
      role: 'ADMIN',
      houseId,
      tasks: list,
      chestItems,
      assignees,
    }
  }

  const { data: tasks } = await admin
    .from('tasks')
    .select('*')
    .eq('house_id', houseId)
    .eq('assigned_to', access.userId)
    // ON_HOLD fica INVISÍVEL para o dependente — mesma garantia das actions.
    .neq('status', 'ON_HOLD')
    .order('created_at', { ascending: false })

  const list = tasks ?? []
  const chestItems = await loadChestItems(admin, list)
  const creatorNames = await getProfileNames(list.map((task) => task.created_by))

  return {
    role: 'DEPENDENT',
    houseId,
    tasks: list,
    chestItems,
    creatorNames,
  }
}

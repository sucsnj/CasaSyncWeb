'use server'

import { createAdminClient } from '@/utils/supabase/admin'
import {
  getHouseAssignees,
  getProfileNames,
} from '@/utils/house'
import {
  getHouseAttachmentSettings,
  getHouseExtensionRulesSettings,
  getHouseTaskDecaySettings,
  getHouseTaskSlaSettings,
  getHouseTextLimitsSettings,
} from '@/utils/house-settings'
import {
  DEFAULT_EXTENSION_RULES,
  DEFAULT_TEXT_LIMITS,
  type TaskDecaySettings,
  type TextLimitsSettings,
} from '@/utils/settings'
import { assertHouseAccess } from '@/utils/tenant-scope'
import type { Tables } from '@/types/database'
import type { ChestItemView } from '@/components/chest/chest-types'

type TaskRow = Tables<'tasks'>

export type TasksBundleSettings = {
  /** Prazo padrão de criação/restauro (dias) — settings `task_sla`. */
  defaultDueDays: number
  /** Janela do chip "Prazo próximo" (horas) — settings `task_sla`. */
  dueSoonHours: number
  /** Dias dos botões "+N dias" do ADMIN — settings `extension_rules`. */
  extensionDayOptions: number[]
  /** Máximo de adiamentos por tarefa (0 = ilimitado) — settings `extension_rules`. */
  maxExtensions: number
  /** Decaimento de pontos — settings `task_decay`. */
  taskDecay: TaskDecaySettings
  /** Teto de descrição — settings `text_limits` (só ADMIN). */
  textLimits?: TextLimitsSettings
  /** A casa permite anexos em tarefa? — settings `attachments`. */
  attachmentsAllowed: boolean
}

export type TasksBundle = {
  role: 'ADMIN' | 'DEPENDENT'
  houseId: string
  tasks: TaskRow[]
  chestItems: Record<string, ChestItemView>
  assignees?: { id: string; full_name: string }[]
  creatorNames?: Record<string, string>
  settings: TasksBundleSettings
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
  const { data, error } = await admin.from('chest_items').select('*').in('id', ids)
  if (error) throw new Error('READ_FAILED')
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
  const isAdmin = access.role === 'ADMIN'

  const [taskSla, extensionRules, taskDecay, textLimits, attachmentSettings] =
    await Promise.all([
      getHouseTaskSlaSettings(houseId),
      isAdmin
        ? getHouseExtensionRulesSettings(houseId)
        : Promise.resolve(DEFAULT_EXTENSION_RULES),
      getHouseTaskDecaySettings(houseId),
      isAdmin
        ? getHouseTextLimitsSettings(houseId)
        : Promise.resolve(DEFAULT_TEXT_LIMITS),
      getHouseAttachmentSettings(houseId),
    ])

  const settings: TasksBundleSettings = {
    defaultDueDays: taskSla.defaultDueDays,
    dueSoonHours: taskSla.dueSoonHours,
    extensionDayOptions: extensionRules.dayOptions,
    maxExtensions: extensionRules.maxExtensions,
    taskDecay,
    textLimits: isAdmin ? textLimits : undefined,
    attachmentsAllowed: attachmentSettings.tasksAllowed,
  }

  if (access.role === 'ADMIN') {
    const [{ data: tasks, error: tasksError }, assignees] = await Promise.all([
      admin
        .from('tasks')
        .select('*')
        .eq('house_id', houseId)
        .order('created_at', { ascending: false }),
      getHouseAssignees(houseId),
    ])

    if (tasksError) throw new Error('READ_FAILED')
    if (tasksError) throw new Error('READ_FAILED')
  const list = tasks ?? []
    const chestItems = await loadChestItems(admin, list)

    return {
      role: 'ADMIN',
      houseId,
      tasks: list,
      chestItems,
      assignees,
      settings,
    }
  }

  const { data: tasks, error: tasksError } = await admin
    .from('tasks')
    .select('*')
    .eq('house_id', houseId)
    .eq('assigned_to', access.userId)
    // ON_HOLD fica INVISÍVEL para o dependente — mesma garantia das actions.
    .neq('status', 'ON_HOLD')
    .order('created_at', { ascending: false })

  if (tasksError) throw new Error('READ_FAILED')
  const list = tasks ?? []
  const chestItems = await loadChestItems(admin, list)
  const creatorNames = await getProfileNames(list.map((task) => task.created_by))

  return {
    role: 'DEPENDENT',
    houseId,
    tasks: list,
    chestItems,
    creatorNames,
    settings,
  }
}

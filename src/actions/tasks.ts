'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/utils/supabase/admin'
import {
  getActiveAdminHouse,
  getDependentHouse,
  getSessionProfile,
} from '@/utils/house'
import type { ActionResult } from './types'

type TaskPatch = {
  title?: string
  description?: string | null
  due_date?: string | null
  points?: number
  assigned_to?: string | null
}

type CreateTaskInput = {
  title: string
  description: string | null
  dueDate: string | null
  points: number
  assignedTo: string
}

/**
 * Verifica (via RLS) que o ADMIN é dono da casa ativa e que `assignee`
 * é dependente dessa mesma casa. A autorização sempre vem da sessão;
 * a escrita de fato acontece com o cliente service-role.
 */
async function assertAdminCanManage(
  admin: ReturnType<typeof createAdminClient>,
  houseId: string
): Promise<{ ok: true; adminId: string } | { ok: false; error: string }> {
  const { user, profile } = await getSessionProfile()

  if (!user || profile?.user_role !== 'ADMIN') {
    return { ok: false, error: 'Apenas administradores podem executar esta ação.' }
  }

  const { data: house } = await admin
    .from('houses')
    .select('owner_id')
    .eq('id', houseId)
    .maybeSingle()

  if (!house || house.owner_id !== user.id) {
    return { ok: false, error: 'Casa não encontrada ou sem permissão.' }
  }

  return { ok: true, adminId: user.id }
}

export async function createTask(input: CreateTaskInput): Promise<ActionResult> {
  const activeHouse = await getActiveAdminHouse()
  if (!activeHouse) {
    return { ok: false, error: 'Crie ou selecione uma casa primeiro.' }
  }

  const admin = createAdminClient()
  const auth = await assertAdminCanManage(admin, activeHouse.id)
  if (!auth.ok) return auth

  const title = input.title.trim()
  if (!title) return { ok: false, error: 'Informe o título da tarefa.' }
  if (input.points < 0) return { ok: false, error: 'Pontos não podem ser negativos.' }

  const { data: assignee } = await admin
    .from('house_members')
    .select('id')
    .eq('house_id', activeHouse.id)
    .eq('profile_id', input.assignedTo)
    .eq('role', 'DEPENDENT')
    .maybeSingle()

  if (!assignee) {
    return { ok: false, error: 'O dependente selecionado não pertence a esta casa.' }
  }

  const { error } = await admin.from('tasks').insert({
    house_id: activeHouse.id,
    title,
    description: input.description?.trim() ? input.description.trim() : null,
    due_date: input.dueDate,
    points: input.points,
    assigned_to: input.assignedTo,
    created_by: auth.adminId,
    status: 'PENDING',
  })

  if (error) return { ok: false, error: 'Falha ao criar a tarefa.' }

  revalidatePath('/tasks')
  return { ok: true, message: `Tarefa "${title}" criada.` }
}

/**
 * Salvamento automático (debounce) de edição do ADMIN.
 * Aceita apenas campos da whitelist; valida novamente a propriedade da casa.
 */
export async function updateTask(
  taskId: string,
  patch: TaskPatch
): Promise<ActionResult> {
  const activeHouse = await getActiveAdminHouse()
  if (!activeHouse) return { ok: false, error: 'Selecione uma casa primeiro.' }

  const admin = createAdminClient()
  const auth = await assertAdminCanManage(admin, activeHouse.id)
  if (!auth.ok) return auth

  const { data: task } = await admin
    .from('tasks')
    .select('house_id, status')
    .eq('id', taskId)
    .maybeSingle()

  if (!task || task.house_id !== activeHouse.id) {
    return { ok: false, error: 'Tarefa não encontrada nesta casa.' }
  }

  // Tarefas concluídas/aprovadas são imutáveis para o ADMIN editar.
  if (task.status !== 'PENDING' && task.status !== 'IN_PROGRESS') {
    return { ok: false, error: 'Tarefa já concluída ou aprovada.' }
  }

  const updates: TaskPatch = {}
  if ('title' in patch) {
    const title = patch.title?.trim()
    if (!title) return { ok: false, error: 'O título não pode ser vazio.' }
    updates.title = title
  }
  if ('description' in patch) {
    const desc = patch.description?.trim()
    updates.description = desc ? desc : null
  }
  if ('points' in patch) {
    if (patch.points === undefined || patch.points < 0) {
      return { ok: false, error: 'Pontos inválidos.' }
    }
    updates.points = patch.points
  }
  if ('due_date' in patch) {
    updates.due_date = patch.due_date ? patch.due_date : null
  }
  if ('assigned_to' in patch) {
    // '' vindo do select "Sem atribuição" é normalizado para null — a coluna
    // é uuid e Postgres rejeitaria uma string vazia.
    const nextAssignee = patch.assigned_to ? patch.assigned_to : null

    if (nextAssignee) {
      const { data: assignee } = await admin
        .from('house_members')
        .select('id')
        .eq('house_id', activeHouse.id)
        .eq('profile_id', nextAssignee)
        .eq('role', 'DEPENDENT')
        .maybeSingle()

      if (!assignee) {
        return { ok: false, error: 'O dependente selecionado não pertence a esta casa.' }
      }
    }
    updates.assigned_to = nextAssignee
  }

  if (Object.keys(updates).length === 0) return { ok: true }

  const { error } = await admin.from('tasks').update(updates).eq('id', taskId)
  if (error) return { ok: false, error: 'Falha ao salvar a tarefa.' }

  revalidatePath('/tasks')
  return { ok: true }
}

/**
 * DEPENDENTE marca a própria tarefa como concluída.
 * Guards: a tarefa deve estar PENDING/IN_PROGRESS e atribuída ao usuário.
 */
export async function completeTask(taskId: string): Promise<ActionResult> {
  const { user } = await getSessionProfile()
  if (!user) return { ok: false, error: 'Autenticação necessária.' }

  const house = await getDependentHouse(user.id)
  if (!house) return { ok: false, error: 'Você ainda não está vinculado a uma casa.' }

  const admin = createAdminClient()

  const { data: task } = await admin
    .from('tasks')
    .select('house_id, assigned_to, status')
    .eq('id', taskId)
    .maybeSingle()

  if (!task || task.house_id !== house.id) {
    return { ok: false, error: 'Tarefa não encontrada na sua casa.' }
  }
  if (task.assigned_to !== user.id) {
    return { ok: false, error: 'Esta tarefa não está atribuída a você.' }
  }
  if (task.status !== 'PENDING' && task.status !== 'IN_PROGRESS') {
    return { ok: false, error: 'Tarefa já finalizada.' }
  }

  const { error } = await admin
    .from('tasks')
    .update({
      status: 'COMPLETED',
      completed_by: user.id,
      completed_at: new Date().toISOString(),
    })
    .eq('id', taskId)

  if (error) return { ok: false, error: 'Falha ao concluir a tarefa.' }

  revalidatePath('/tasks')
  return { ok: true }
}

/**
 * ADMIN aprova a tarefa concluída. Aqui acontece a creditação de pontos:
 * o valor da tarefa é somado a `profiles.points` do dependente.
 *
 * Ensino (teach): a transação é modelada como "guarded transitions":
 *   1. COMPLETED -> APPROVED só se o status atual ainda for COMPLETED
 *      (evita crédito duplicado em cliques concorrentes).
 *   2. A creditação é feita com o cliente service-role (não há policy RLS
 *      que permita ao ADMIN editar `profiles.points` de terceiros, e é isso
 *      que queremos: o balanço só muda por este caminho de negócio).
 *   3. Se a creditação falhar, revertemos a tarefa para COMPLETED.
 */
export async function approveTask(taskId: string): Promise<ActionResult> {
  const activeHouse = await getActiveAdminHouse()
  if (!activeHouse) return { ok: false, error: 'Selecione uma casa primeiro.' }

  const admin = createAdminClient()
  const auth = await assertAdminCanManage(admin, activeHouse.id)
  if (!auth.ok) return auth

  const { data: task } = await admin
    .from('tasks')
    .select('house_id, status, points, assigned_to')
    .eq('id', taskId)
    .maybeSingle()

  if (!task || task.house_id !== activeHouse.id) {
    return { ok: false, error: 'Tarefa não encontrada nesta casa.' }
  }
  if (task.status !== 'COMPLETED') {
    return { ok: false, error: 'Somente tarefas concluídas podem ser aprovadas.' }
  }
  if (!task.assigned_to) {
    return { ok: false, error: 'Tarefa sem dependente atribuído.' }
  }

  const { data: awarded, error: taskError } = await admin
    .from('tasks')
    .update({ status: 'APPROVED' })
    .eq('id', taskId)
    .eq('status', 'COMPLETED') // guard: impede crédito duplicado
    .select('id')

  if (taskError || !awarded || awarded.length === 0) {
    return { ok: false, error: 'A tarefa já foi aprovada por outra pessoa.' }
  }

  const { data: dependent } = await admin
    .from('profiles')
    .select('points')
    .eq('id', task.assigned_to)
    .maybeSingle()

  if (!dependent) {
    await admin.from('tasks').update({ status: 'COMPLETED' }).eq('id', taskId)
    return { ok: false, error: 'Dependente não encontrado. Crédito revertido.' }
  }

  const { error: pointsError } = await admin
    .from('profiles')
    .update({ points: dependent.points + task.points })
    .eq('id', task.assigned_to)

  if (pointsError) {
    // Rollback: devolve a tarefa ao estado anterior para não perder o histórico.
    await admin.from('tasks').update({ status: 'COMPLETED' }).eq('id', taskId)
    return { ok: false, error: 'Falha ao creditar pontos. Tarefa revertida.' }
  }

  revalidatePath('/tasks')
  revalidatePath('/rewards')
  revalidatePath('/dashboard/dependent')

  return {
    ok: true,
    message: `Tarefa aprovada: ${task.points} ponto(s) creditado(s).`,
  }
}
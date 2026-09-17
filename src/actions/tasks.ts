'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/utils/supabase/admin'
import {
  getActiveAdminHouse,
  getDependentHouse,
  getSessionProfile,
} from '@/utils/house'
import { notifyHouse, notifyUser } from '@/utils/notifications'
import type { ActionResult } from './types'

type TaskPatch = {
  title?: string
  description?: string | null
  due_date?: string | null
  points?: number
  assigned_to?: string | null
  image_url?: string | null
}

type CreateTaskInput = {
  title: string
  description: string | null
  dueDate: string | null
  points: number
  assignedTo: string
  imageUrl: string | null
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

  const { data: membership } = await admin
    .from('house_members')
    .select('id')
    .eq('house_id', houseId)
    .eq('profile_id', user.id)
    .eq('role', 'ADMIN')
    .maybeSingle()

  if (!membership) {
    return { ok: false, error: 'Casa não encontrada ou sem permissão.' }
  }

  return { ok: true, adminId: user.id }
}

/**
 * Ajusta o saldo do dependente somando `delta` (pode ser negativo — o saldo
 * pode ficar negativo por penalidade de "não entregue"). Retorna `false` se o
 * perfil não existir ou a escrita falhar.
 */
async function adjustPoints(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string,
  delta: number
): Promise<boolean> {
  const { data: profile } = await admin
    .from('profiles')
    .select('points')
    .eq('id', profileId)
    .maybeSingle()

  if (!profile) return false

  const { error } = await admin
    .from('profiles')
    .update({ points: profile.points + delta })
    .eq('id', profileId)

  return !error
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
    image_url: input.imageUrl,
  })

  if (error) return { ok: false, error: 'Falha ao criar a tarefa.' }

  await notifyUser(admin, {
    houseId: activeHouse.id,
    recipientId: input.assignedTo,
    actorId: auth.adminId,
    type: 'TASK_CREATED',
    title: 'Nova tarefa',
    body: `Você recebeu a tarefa "${title}" (${input.points} pts).`,
    link: '/tasks',
  })

  revalidatePath('/tasks')
  return { ok: true, message: `Tarefa "${title}" criada.` }
}

/** Compara dois prazos (timestamptz do banco vs valor `datetime-local`). */
function dueDateChanged(prev: string | null, next: string | null): boolean {
  if (prev === next) return false
  const prevTime = prev ? new Date(prev).getTime() : null
  const nextTime = next ? new Date(next).getTime() : null
  if (prevTime === null || nextTime === null) return prevTime !== nextTime
  return prevTime !== nextTime
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
    .select(
      'house_id, status, due_date, extension_requested, extension_reason, points, assigned_to'
    )
    .eq('id', taskId)
    .maybeSingle()

  if (!task || task.house_id !== activeHouse.id) {
    return { ok: false, error: 'Tarefa não encontrada nesta casa.' }
  }

  // Tarefas concluídas/aprovadas são imutáveis para o ADMIN editar. Uma tarefa
  // "não entregue" continua editável — alterar o prazo equivale a aprovar um
  // adiamento (devolve os pontos e zera a tarefa).
  const isNotDelivered = task.status === 'NOT_DELIVERED'
  if (!isNotDelivered && task.status !== 'PENDING' && task.status !== 'IN_PROGRESS') {
    return { ok: false, error: 'Tarefa já concluída ou aprovada.' }
  }

  const updates: TaskPatch & {
    extension_requested?: boolean
    extension_reason?: string | null
    status?: 'PENDING' | 'NOT_DELIVERED'
  } = {}
  let pointsToRestore = 0
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
    if (isNotDelivered) {
      return {
        ok: false,
        error: 'Os pontos de uma tarefa não entregue só mudam via adiamento.',
      }
    }
    if (patch.points === undefined || patch.points < 0) {
      return { ok: false, error: 'Pontos inválidos.' }
    }
    updates.points = patch.points
  }
  if ('due_date' in patch) {
    const nextDue = patch.due_date ? patch.due_date : null
    updates.due_date = nextDue

    // Pedido de adiamento pendente + prazo alterado para um valor diferente
    // do atual => o pedido é considerado aceito automaticamente com a nova data.
    if (dueDateChanged(task.due_date, nextDue)) {
      if (task.extension_requested) {
        updates.extension_requested = false
        updates.extension_reason = null
      }

      // Tarefa não entregue: alterar o prazo tem o mesmo efeito de um adiamento
      // aprovado — devolve os pontos debitados e zera a tarefa. O status passa a
      // ser o equivalente ao novo prazo.
      if (isNotDelivered) {
        pointsToRestore = task.points
        updates.points = 0
        updates.status =
          nextDue && new Date(nextDue).getTime() < Date.now()
            ? 'NOT_DELIVERED'
            : 'PENDING'
      }
    }
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
  if ('image_url' in patch) {
    updates.image_url = patch.image_url?.trim() ? patch.image_url.trim() : null
  }

  if (Object.keys(updates).length === 0) return { ok: true }

  const { error } = await admin.from('tasks').update(updates).eq('id', taskId)
  if (error) return { ok: false, error: 'Falha ao salvar a tarefa.' }

  if (pointsToRestore > 0 && task.assigned_to) {
    const restored = await adjustPoints(admin, task.assigned_to, pointsToRestore)
    if (!restored) {
      // Rollback: devolve a tarefa ao estado "não entregue".
      await admin
        .from('tasks')
        .update({
          status: 'NOT_DELIVERED',
          points: pointsToRestore,
          due_date: task.due_date,
        })
        .eq('id', taskId)
      return { ok: false, error: 'Falha ao devolver os pontos. Prazo revertido.' }
    }
  }

  if (pointsToRestore > 0) {
    revalidatePath('/rewards')
    revalidatePath('/dashboard/dependent')
  }

  revalidatePath('/tasks')
  return { ok: true }
}

/**
 * DEPENDENTE marca a própria tarefa como concluída.
 * Guards: a tarefa deve estar PENDING/IN_PROGRESS e atribuída ao usuário.
 */
export async function completeTask(taskId: string): Promise<ActionResult> {
  const { user, profile } = await getSessionProfile()
  if (!user) return { ok: false, error: 'Autenticação necessária.' }

  const house = await getDependentHouse(user.id)
  if (!house) return { ok: false, error: 'Você ainda não está vinculado a uma casa.' }

  const admin = createAdminClient()

  const { data: task } = await admin
    .from('tasks')
    .select('house_id, assigned_to, status, title')
    .eq('id', taskId)
    .maybeSingle()

  if (!task || task.house_id !== house.id) {
    return { ok: false, error: 'Tarefa não encontrada na sua casa.' }
  }
  if (task.assigned_to !== user.id) {
    return { ok: false, error: 'Esta tarefa não está atribuída a você.' }
  }
  if (task.status === 'NOT_DELIVERED') {
    return {
      ok: false,
      error: 'Tarefa marcada como não entregue. Peça mais tempo ao administrador.',
    }
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

  await notifyHouse(admin, {
    houseId: house.id,
    actorId: user.id,
    side: 'ADMINS',
    excludeUserId: user.id,
    type: 'TASK_COMPLETED',
    title: 'Tarefa concluída',
    body: `${profile?.full_name ?? 'O dependente'} concluiu "${task.title}". Aguardando aprovação.`,
    link: '/tasks',
  })

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
    .select('house_id, status, points, assigned_to, title')
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

  await notifyUser(admin, {
    houseId: activeHouse.id,
    recipientId: task.assigned_to,
    actorId: auth.adminId,
    type: 'TASK_APPROVED',
    title: 'Tarefa aprovada',
    body: `"${task.title}" foi aprovada. +${task.points} pts.`,
    link: '/tasks',
  })

  revalidatePath('/tasks')
  revalidatePath('/rewards')
  revalidatePath('/dashboard/dependent')

  return {
    ok: true,
    message: `Tarefa aprovada: ${task.points} ponto(s) creditado(s).`,
  }
}

/**
 * ADMIN desaprova a conclusão do dependente: devolve a tarefa de COMPLETED
 * para PENDING e limpa `completed_by`/`completed_at` (o dependente pode
 * refazer e marcar novamente). Transição guardada para não reabrir uma tarefa
 * que já tenha sido aprovada/creditada em outra aba.
 */
export async function rejectCompletedTask(taskId: string): Promise<ActionResult> {
  const activeHouse = await getActiveAdminHouse()
  if (!activeHouse) return { ok: false, error: 'Selecione uma casa primeiro.' }

  const admin = createAdminClient()
  const auth = await assertAdminCanManage(admin, activeHouse.id)
  if (!auth.ok) return auth

  const { data: task } = await admin
    .from('tasks')
    .select('house_id, status, title, assigned_to')
    .eq('id', taskId)
    .maybeSingle()

  if (!task || task.house_id !== activeHouse.id) {
    return { ok: false, error: 'Tarefa não encontrada nesta casa.' }
  }
  if (task.status !== 'COMPLETED') {
    return { ok: false, error: 'Somente tarefas concluídas podem ser desaprovadas.' }
  }

  const { data: reopened, error } = await admin
    .from('tasks')
    .update({ status: 'PENDING', completed_by: null, completed_at: null })
    .eq('id', taskId)
    .eq('status', 'COMPLETED') // guard: não reabre tarefa já aprovada
    .select('id')

  if (error || !reopened || reopened.length === 0) {
    return { ok: false, error: 'A tarefa já foi aprovada por outra pessoa.' }
  }

  if (task.assigned_to) {
    await notifyUser(admin, {
      houseId: activeHouse.id,
      recipientId: task.assigned_to,
      actorId: auth.adminId,
      type: 'TASK_REJECTED',
      title: 'Tarefa devolvida',
      body: `"${task.title}" foi devolvida para você refazer.`,
      link: '/tasks',
    })
  }

  revalidatePath('/tasks')
  revalidatePath('/dashboard/dependent')

  return { ok: true, message: 'Tarefa devolvida ao dependente.' }
}

/**
 * ADMIN marca uma tarefa atrasada como "não entregue": debita do dependente os
 * pontos que a tarefa valeria (o saldo pode ficar negativo) e muda o status
 * para NOT_DELIVERED. A penalidade só é revertida por um adiamento aprovado
 * (que devolve os pontos e zera a tarefa).
 */
export async function markTaskNotDelivered(taskId: string): Promise<ActionResult> {
  const activeHouse = await getActiveAdminHouse()
  if (!activeHouse) return { ok: false, error: 'Selecione uma casa primeiro.' }

  const admin = createAdminClient()
  const auth = await assertAdminCanManage(admin, activeHouse.id)
  if (!auth.ok) return auth

  const { data: task } = await admin
    .from('tasks')
    .select('house_id, status, points, assigned_to, due_date, title')
    .eq('id', taskId)
    .maybeSingle()

  if (!task || task.house_id !== activeHouse.id) {
    return { ok: false, error: 'Tarefa não encontrada nesta casa.' }
  }
  if (task.status !== 'PENDING' && task.status !== 'IN_PROGRESS') {
    return { ok: false, error: 'Somente tarefas abertas podem ser marcadas como não entregues.' }
  }
  if (!task.due_date || new Date(task.due_date).getTime() >= Date.now()) {
    return { ok: false, error: 'Só tarefas atrasadas podem ser marcadas como não entregues.' }
  }
  if (!task.assigned_to) {
    return { ok: false, error: 'Tarefa sem dependente atribuído.' }
  }

  const previousStatus = task.status

  // Guard: a transição PENDING/IN_PROGRESS -> NOT_DELIVERED acontece uma única
  // vez; um clique concorrente não debita os pontos duas vezes.
  const { data: marked, error: statusError } = await admin
    .from('tasks')
    .update({ status: 'NOT_DELIVERED' })
    .eq('id', taskId)
    .in('status', ['PENDING', 'IN_PROGRESS'])
    .select('id')

  if (statusError || !marked || marked.length === 0) {
    return { ok: false, error: 'A tarefa já foi finalizada por outra pessoa.' }
  }

  const debited = await adjustPoints(admin, task.assigned_to, -task.points)
  if (!debited) {
    await admin.from('tasks').update({ status: previousStatus }).eq('id', taskId)
    return { ok: false, error: 'Falha ao debitar os pontos. Ação revertida.' }
  }

  await notifyUser(admin, {
    houseId: activeHouse.id,
    recipientId: task.assigned_to,
    actorId: auth.adminId,
    type: 'TASK_NOT_DELIVERED',
    title: 'Tarefa não entregue',
    body: `"${task.title}" foi marcada como não entregue (−${task.points} pts). Peça mais tempo para reabrir.`,
    link: '/tasks',
  })

  revalidatePath('/tasks')
  revalidatePath('/rewards')
  revalidatePath('/dashboard/dependent')

  return {
    ok: true,
    message: `Tarefa marcada como não entregue (−${task.points} pts).`,
  }
}

/**
 * ADMIN restaura uma tarefa aprovada para reaproveitá-la sem criar uma nova:
 * os pontos já creditados NÃO são alterados, os demais dados são mantidos e o
 * prazo reinicia (agora + 1 dia). A tarefa volta para PENDING.
 */
export async function restoreTask(taskId: string): Promise<ActionResult> {
  const activeHouse = await getActiveAdminHouse()
  if (!activeHouse) return { ok: false, error: 'Selecione uma casa primeiro.' }

  const admin = createAdminClient()
  const auth = await assertAdminCanManage(admin, activeHouse.id)
  if (!auth.ok) return auth

  const { data: task } = await admin
    .from('tasks')
    .select('house_id, status, title, assigned_to')
    .eq('id', taskId)
    .maybeSingle()

  if (!task || task.house_id !== activeHouse.id) {
    return { ok: false, error: 'Tarefa não encontrada nesta casa.' }
  }
  if (task.status !== 'APPROVED') {
    return { ok: false, error: 'Somente tarefas aprovadas podem ser restauradas.' }
  }

  const nextDue = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  const { data: restored, error } = await admin
    .from('tasks')
    .update({
      status: 'PENDING',
      due_date: nextDue,
      completed_by: null,
      completed_at: null,
      extension_requested: false,
      extension_reason: null,
    })
    .eq('id', taskId)
    .eq('status', 'APPROVED') // guard: impede restaurar duas vezes
    .select('id')

  if (error || !restored || restored.length === 0) {
    return { ok: false, error: 'A tarefa já foi restaurada por outra pessoa.' }
  }

  if (task.assigned_to) {
    await notifyUser(admin, {
      houseId: activeHouse.id,
      recipientId: task.assigned_to,
      actorId: auth.adminId,
      type: 'TASK_RESTORED',
      title: 'Tarefa reaberta',
      body: `"${task.title}" foi restaurada com novo prazo.`,
      link: '/tasks',
    })
  }

  revalidatePath('/tasks')
  revalidatePath('/dashboard/dependent')

  return { ok: true, message: 'Tarefa restaurada: prazo reiniciado para +1 dia.' }
}

/**
 * ADMIN conclui e aprova a tarefa em um único passo, creditando os pontos
 * mesmo que o prazo ainda não tenha vencido. Transição guardada
 * (PENDING/IN_PROGRESS -> APPROVED) impede crédito duplicado em cliques
 * concorrentes; falha na creditação reverte a tarefa ao estado anterior.
 */
export async function adminCompleteTask(taskId: string): Promise<ActionResult> {
  const activeHouse = await getActiveAdminHouse()
  if (!activeHouse) return { ok: false, error: 'Selecione uma casa primeiro.' }

  const admin = createAdminClient()
  const auth = await assertAdminCanManage(admin, activeHouse.id)
  if (!auth.ok) return auth

  const { data: task } = await admin
    .from('tasks')
    .select('house_id, status, points, assigned_to, title')
    .eq('id', taskId)
    .maybeSingle()

  if (!task || task.house_id !== activeHouse.id) {
    return { ok: false, error: 'Tarefa não encontrada nesta casa.' }
  }
  if (task.status !== 'PENDING' && task.status !== 'IN_PROGRESS') {
    return { ok: false, error: 'Somente tarefas abertas podem ser concluídas.' }
  }
  if (!task.assigned_to) {
    return { ok: false, error: 'Tarefa sem dependente atribuído.' }
  }

  const { data: awarded, error: taskError } = await admin
    .from('tasks')
    .update({
      status: 'APPROVED',
      completed_by: auth.adminId,
      completed_at: new Date().toISOString(),
    })
    .eq('id', taskId)
    .in('status', ['PENDING', 'IN_PROGRESS']) // guard: impede crédito duplicado
    .select('id')

  if (taskError || !awarded || awarded.length === 0) {
    return { ok: false, error: 'A tarefa já foi finalizada.' }
  }

  const { data: dependent } = await admin
    .from('profiles')
    .select('points')
    .eq('id', task.assigned_to)
    .maybeSingle()

  if (!dependent) {
    await admin
      .from('tasks')
      .update({
        status: task.status,
        completed_by: null,
        completed_at: null,
      })
      .eq('id', taskId)
    return { ok: false, error: 'Dependente não encontrado. Crédito revertido.' }
  }

  const { error: pointsError } = await admin
    .from('profiles')
    .update({ points: dependent.points + task.points })
    .eq('id', task.assigned_to)

  if (pointsError) {
    // Rollback: devolve a tarefa ao estado anterior.
    await admin
      .from('tasks')
      .update({
        status: task.status,
        completed_by: null,
        completed_at: null,
      })
      .eq('id', taskId)
    return { ok: false, error: 'Falha ao creditar pontos. Tarefa revertida.' }
  }

  await notifyUser(admin, {
    houseId: activeHouse.id,
    recipientId: task.assigned_to,
    actorId: auth.adminId,
    type: 'TASK_APPROVED',
    title: 'Tarefa concluída',
    body: `"${task.title}" foi concluída pelo administrador. +${task.points} pts.`,
    link: '/tasks',
  })

  revalidatePath('/tasks')
  revalidatePath('/rewards')
  revalidatePath('/dashboard/dependent')

  return {
    ok: true,
    message: `Tarefa concluída: ${task.points} ponto(s) creditado(s).`,
  }
}

/**
 * DEPENDENTE pede mais tempo para uma tarefa aberta.
 * Marca `extension_requested = true` + `extension_reason` para o ADMIN resolver.
 */
export async function requestTaskExtension(
  taskId: string,
  reason: string
): Promise<ActionResult> {
  const { user, profile } = await getSessionProfile()
  if (!user || profile?.user_role !== 'DEPENDENT') {
    return { ok: false, error: 'Apenas dependentes podem pedir adiamento.' }
  }

  const house = await getDependentHouse(user.id)
  if (!house) return { ok: false, error: 'Você ainda não está vinculado a uma casa.' }

  const justification = reason.trim()
  if (!justification) {
    return { ok: false, error: 'Informe o motivo do pedido.' }
  }
  if (justification.length > 500) {
    return { ok: false, error: 'Justificativa muito longa (máximo 500 caracteres).' }
  }

  const admin = createAdminClient()

  const { data: task } = await admin
    .from('tasks')
    .select('house_id, assigned_to, status, extension_requested, title')
    .eq('id', taskId)
    .maybeSingle()

  if (!task || task.house_id !== house.id) {
    return { ok: false, error: 'Tarefa não encontrada na sua casa.' }
  }
  if (task.assigned_to !== user.id) {
    return { ok: false, error: 'Esta tarefa não está atribuída a você.' }
  }
  if (
    task.status !== 'PENDING' &&
    task.status !== 'IN_PROGRESS' &&
    task.status !== 'NOT_DELIVERED'
  ) {
    return { ok: false, error: 'Tarefa já finalizada.' }
  }
  if (task.extension_requested) {
    return { ok: false, error: 'Já existe um pedido de adiamento para esta tarefa.' }
  }

  const { error } = await admin
    .from('tasks')
    .update({ extension_requested: true, extension_reason: justification })
    .eq('id', taskId)

  if (error) return { ok: false, error: 'Falha ao registrar o pedido.' }

  await notifyHouse(admin, {
    houseId: house.id,
    actorId: user.id,
    side: 'ADMINS',
    excludeUserId: user.id,
    type: 'EXTENSION_REQUESTED',
    title: 'Pedido de adiamento',
    body: `${profile?.full_name ?? 'O dependente'} pediu mais tempo para "${task.title}".`,
    link: '/tasks',
  })

  revalidatePath('/tasks')
  return { ok: true, message: 'Pedido de adiamento enviado.' }
}

/**
 * ADMIN aprova (usa o prazo atual, ou hoje, e soma `days` dias ao prazo) ou
 * rejeita o pedido de adiamento — em ambos os casos a flag é limpa.
 *
 * Se a tarefa estiver marcada como "não entregue", aprovar o adiamento devolve
 * ao dependente os pontos debitados (pode ser negativo na ida) e zera a tarefa,
 * que volta a valer 0 e é reaberta conforme o novo prazo.
 */
export async function resolveTaskExtension(
  taskId: string,
  approve: boolean,
  days = 3
): Promise<ActionResult> {
  const activeHouse = await getActiveAdminHouse()
  if (!activeHouse) return { ok: false, error: 'Selecione uma casa primeiro.' }

  const admin = createAdminClient()
  const auth = await assertAdminCanManage(admin, activeHouse.id)
  if (!auth.ok) return auth

  const { data: task } = await admin
    .from('tasks')
    .select(
      'house_id, status, due_date, extension_requested, extension_reason, points, assigned_to, title'
    )
    .eq('id', taskId)
    .maybeSingle()

  if (!task || task.house_id !== activeHouse.id) {
    return { ok: false, error: 'Tarefa não encontrada nesta casa.' }
  }
  if (!task.extension_requested) {
    return { ok: false, error: 'Esta tarefa não tem um pedido de adiamento pendente.' }
  }
  if (approve && days < 1) {
    return { ok: false, error: 'Dias de adiamento inválidos.' }
  }

  const isNotDelivered = task.status === 'NOT_DELIVERED'

  const updates: {
    extension_requested: boolean
    extension_reason: null
    due_date?: string
    points?: number
    status?: 'PENDING' | 'NOT_DELIVERED'
  } = {
    extension_requested: false,
    extension_reason: null,
  }

  if (approve) {
    const currentDue = task.due_date ? new Date(task.due_date) : new Date()
    const base = currentDue.getTime() > Date.now() ? currentDue : new Date()
    const nextDue = new Date(base.getTime() + days * 24 * 60 * 60 * 1000)
    updates.due_date = nextDue.toISOString()

    if (isNotDelivered) {
      updates.points = 0
      updates.status =
        nextDue.getTime() < Date.now() ? 'NOT_DELIVERED' : 'PENDING'
    }
  }

  const { error } = await admin.from('tasks').update(updates).eq('id', taskId)

  if (error) return { ok: false, error: 'Falha ao resolver o pedido.' }

  if (approve && isNotDelivered && task.assigned_to) {
    const restored = await adjustPoints(admin, task.assigned_to, task.points)
    if (!restored) {
      // Rollback: devolve a tarefa ao estado "não entregue" com o pedido pendente.
      await admin
        .from('tasks')
        .update({
          status: 'NOT_DELIVERED',
          points: task.points,
          due_date: task.due_date,
          extension_requested: true,
          extension_reason: task.extension_reason,
        })
        .eq('id', taskId)
      return { ok: false, error: 'Falha ao devolver os pontos. Ação revertida.' }
    }

    revalidatePath('/rewards')
    revalidatePath('/dashboard/dependent')
  }

  if (task.assigned_to) {
    await notifyUser(admin, {
      houseId: activeHouse.id,
      recipientId: task.assigned_to,
      actorId: auth.adminId,
      type: approve ? 'EXTENSION_APPROVED' : 'EXTENSION_REJECTED',
      title: approve ? 'Adiamento aprovado' : 'Adiamento recusado',
      body: approve
        ? `"${task.title}" ganhou +${days} dias.${isNotDelivered ? ' Pontos devolvidos.' : ''}`
        : `Seu pedido de adiamento para "${task.title}" foi recusado.`,
      link: '/tasks',
    })
  }

  revalidatePath('/tasks')

  if (!approve) {
    return { ok: true, message: 'Pedido de adiamento rejeitado.' }
  }

  return {
    ok: true,
    message: isNotDelivered
      ? `Adiamento aprovado (+${days} dias). Pontos devolvidos e tarefa agora vale 0.`
      : `Adiamento aprovado (+${days} dias).`,
  }
}
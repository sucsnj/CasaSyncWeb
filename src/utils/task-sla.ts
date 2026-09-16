export type TaskSlaStatus = 'overdue' | 'dueSoon' | 'normal'

/**
 * Status de prazo de uma tarefa (SLA):
 * - `overdue`: agora > dueDate → Atrasada.
 * - `dueSoon`: tempo restante <= 20% do tempo total (criada → prazo).
 * - `normal`: sem prazo, prazo inválido ou folga suficiente.
 */
export function getTaskSlaStatus(
  createdAt: string | null | undefined,
  dueDate: string | null | undefined,
  now: Date = new Date()
): TaskSlaStatus {
  if (!dueDate) return 'normal'

  const due = new Date(dueDate)
  if (Number.isNaN(due.getTime())) return 'normal'
  if (now.getTime() > due.getTime()) return 'overdue'

  if (!createdAt) return 'normal'
  const created = new Date(createdAt)
  if (Number.isNaN(created.getTime())) return 'normal'

  const total = due.getTime() - created.getTime()
  const remaining = due.getTime() - now.getTime()
  if (total <= 0) return 'normal'

  return remaining <= total * 0.2 ? 'dueSoon' : 'normal'
}
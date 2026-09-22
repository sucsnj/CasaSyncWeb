export type TaskSlaStatus = 'overdue' | 'dueSoon' | 'normal'

/**
 * Status de prazo de uma tarefa (SLA):
 * - `overdue`: agora > dueDate → Atrasada.
 * - `dueSoon`: tempo restante <= `dueSoonRatio` do tempo total (criada → prazo).
 * - `normal`: sem prazo, prazo inválido ou folga suficiente.
 *
 * `dueSoonRatio` vem das settings da casa (default 0.2 = 20%); 0 desliga o
 * aviso de "Prazo próximo" sem afetar `overdue`.
 */
export function getTaskSlaStatus(
  createdAt: string | null | undefined,
  dueDate: string | null | undefined,
  now: Date = new Date(),
  dueSoonRatio = 0.2
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

  return remaining <= total * dueSoonRatio ? 'dueSoon' : 'normal'
}
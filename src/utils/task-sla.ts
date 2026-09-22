export type TaskSlaStatus = 'overdue' | 'dueSoon' | 'normal'

/**
 * Status de prazo de uma tarefa (SLA):
 * - `overdue`: agora > dueDate → Atrasada.
 * - `dueSoon`: faltam menos de `dueSoonHours` horas para o prazo (limiar
 *   absoluto, independente da duração total da tarefa).
 * - `normal`: sem prazo, prazo inválido ou folga suficiente.
 *
 * `dueSoonHours` vem das settings da casa (default 4h); 0 desliga o aviso de
 * "Prazo próximo" sem afetar `overdue`.
 */
export function getTaskSlaStatus(
  dueDate: string | null | undefined,
  now: Date = new Date(),
  dueSoonHours = 4
): TaskSlaStatus {
  if (!dueDate) return 'normal'

  const due = new Date(dueDate)
  if (Number.isNaN(due.getTime())) return 'normal'
  if (now.getTime() > due.getTime()) return 'overdue'
  if (dueSoonHours <= 0) return 'normal'

  const remaining = due.getTime() - now.getTime()
  return remaining <= dueSoonHours * 60 * 60 * 1000 ? 'dueSoon' : 'normal'
}
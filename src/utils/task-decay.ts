import type { TaskDecaySettings } from '@/utils/settings'

const HOUR_MS = 60 * 60 * 1000

/**
 * Valor corrente de uma tarefa sob a mecânica de decaimento: a cada
 * `periodHours` completas desde a criação perde-se `pointsPerPeriod` pontos,
 * mas a janela é CAPADA no `due_date` — depois do prazo a perda não cresce
 * mais (uma tarefa "não entregue" tem valor estável). Piso em 0; desativado
 * retorna o valor-base.
 *
 * Módulo puro (sem imports de servidor) p/ ser usado nas Server Actions
 * (crédito/débito/devolução) e nos cards de tarefas (exibição).
 */
export function getTaskCurrentPoints(
  basePoints: number,
  createdAt: string,
  dueDate: string | null,
  settings: TaskDecaySettings,
  now: Date = new Date()
): number {
  if (!settings.enabled || basePoints <= 0) return basePoints

  const created = new Date(createdAt).getTime()
  if (Number.isNaN(created)) return basePoints

  // Janela do decaimento: da criação até agora, mas só enquanto o prazo não
  // venceu (cap no due_date). Sem prazo, a janela corre até "agora".
  let windowEnd = now.getTime()
  if (dueDate) {
    const due = new Date(dueDate).getTime()
    if (!Number.isNaN(due)) windowEnd = Math.min(windowEnd, due)
  }

  const elapsedMs = windowEnd - created
  if (elapsedMs <= 0 || settings.periodHours <= 0) return basePoints

  const periods = Math.floor(elapsedMs / (settings.periodHours * HOUR_MS))
  const loss = periods * settings.pointsPerPeriod
  return Math.max(0, basePoints - loss)
}
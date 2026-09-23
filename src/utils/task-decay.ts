import type { TaskDecaySettings } from '@/utils/settings'

const HOUR_MS = 60 * 60 * 1000

/**
 * Valor corrente de uma tarefa sob a mecânica de decaimento: a cada
 * `periodHours` completas desde o ponto de partida (`decay_started_at` —
 * criação ou última edição) perde-se `pointsPerPeriod` pontos, mas a janela é
 * CAPADA no `due_date` — depois do prazo a perda não cresce mais (uma tarefa
 * "não entregue" tem valor estável). Piso em 0; desativado retorna o valor-base.
 * Adiamentos (`resolveTaskExtension`/auto-aceite) NÃO reiniciam o relógio.
 *
 * Módulo puro (sem imports de servidor) p/ ser usado nas Server Actions
 * (crédito/débito/devolução) e nos cards de tarefas (exibição).
 */
export function getTaskCurrentPoints(
  basePoints: number,
  startAt: string,
  dueDate: string | null,
  settings: TaskDecaySettings,
  now: Date = new Date()
): number {
  if (!settings.enabled || basePoints <= 0) return basePoints

  const start = new Date(startAt).getTime()
  if (Number.isNaN(start)) return basePoints

  // Janela do decaimento: do ponto de partida até agora, mas só enquanto o
  // prazo não venceu (cap no due_date). Sem prazo, a janela corre até "agora".
  let windowEnd = now.getTime()
  if (dueDate) {
    const due = new Date(dueDate).getTime()
    if (!Number.isNaN(due)) windowEnd = Math.min(windowEnd, due)
  }

  const elapsedMs = windowEnd - start
  if (elapsedMs <= 0 || settings.periodHours <= 0) return basePoints

  const periods = Math.floor(elapsedMs / (settings.periodHours * HOUR_MS))
  const loss = periods * settings.pointsPerPeriod
  return Math.max(0, basePoints - loss)
}

/**
 * Ponto de partida do relógio do decaimento de uma tarefa: `decay_started_at`
 * (criação ou última edição) com fallback para `created_at` — tarefas criadas
 * antes da coluna existir têm `decay_started_at = null`.
 */
export function getTaskDecayStart(
  createdAt: string,
  decayStartedAt: string | null
): string {
  return decayStartedAt ?? createdAt
}
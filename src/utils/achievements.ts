export type AchievementMetricType =
  | 'TASKS_APPROVED'
  | 'TASKS_REJECTED'
  | 'REWARDS_CLAIMED'
  | 'CUSTOM_REWARDS_APPROVED'
  | 'APP_LOGIN_DAYS'
  | 'STREAK_LOGIN_DAYS'
  | 'EARNED_POINTS'
  | 'MANUAL'

export const ACHIEVEMENT_METRIC_TYPES: AchievementMetricType[] = [
  'TASKS_APPROVED',
  'TASKS_REJECTED',
  'REWARDS_CLAIMED',
  'CUSTOM_REWARDS_APPROVED',
  'APP_LOGIN_DAYS',
  'STREAK_LOGIN_DAYS',
  'EARNED_POINTS',
  'MANUAL',
]

/** Rótulo curto de cada métrica, usado nos cards ADMIN/dependente. */
export const METRIC_LABELS: Record<AchievementMetricType, string> = {
  TASKS_APPROVED: 'a cada tarefa aprovada',
  TASKS_REJECTED: 'a cada tarefa reprovada',
  REWARDS_CLAIMED: 'a cada recompensa resgatada',
  CUSTOM_REWARDS_APPROVED: 'a cada sugestão aprovada',
  APP_LOGIN_DAYS: 'a cada dia de acesso ao app',
  STREAK_LOGIN_DAYS: 'a cada dia seguido no app',
  EARNED_POINTS: 'a cada N pontos ganhos em aprovações',
  MANUAL: 'concessão manual pelo tutor',
}

/** Ícones Lucide permitidos em `achievements.icon` (mapeados na UI). */
export const ACHIEVEMENT_ICONS = [
  'trophy',
  'star',
  'award',
  'flame',
  'zap',
  'coins',
  'sparkles',
  'target',
  'rocket',
  'heart',
  'crown',
  'medal',
] as const

/**
 * Recompensa da conquista no nível `level`: pts base × nível × multiplicador
 * por nível (configurável por conquista, default 1). Ex.: base 10, nível 3,
 * mult 1 → 30 pts; mult 2 → 60 pts. Usada no crédito (`claimAchievementReward`)
 * e na exibição dos cards (ADMIN/dependente). Função pura (isomórfica).
 */
export function achievementRewardAtLevel(
  basePoints: number,
  level: number,
  multiplier: number
): number {
  return Math.round(basePoints * level * multiplier)
}

/**
 * Nível máximo efetivo da conquista: o `max_level` só vale para conquistas
 * repetíveis; as únicas (`is_repeatable = false`) resgatam uma única vez no
 * nível 1. Usada para capar `level` no resgate e na UI.
 */
export function maxAchievementLevel(
  isRepeatable: boolean,
  maxLevel: number
): number {
  return isRepeatable ? maxLevel : 1
}

/**
 * Progresso de UM ciclo limitado ao objetivo (`0..target`).
 *
 * É a regra de **trava**: o progresso nunca passa do objetivo, então uma
 * conquista desbloqueada e ainda não resgatada fica congelada em `N/N` e o
 * excedente é descartado — o próximo ciclo só volta a contar depois do resgate.
 * Também serve de teto na exibição (barra/`N/N`), protegendo contra linhas
 * gravadas antes da trava. Piso em 0.
 */
export function capAchievementProgress(
  progress: number,
  target: number
): number {
  return Math.min(target, Math.max(0, progress))
}

/**
 * Aplica a ocorrência (`amount`, com sinal) ao progresso de um ciclo:
 * - **soma** trava no objetivo (`capAchievementProgress`) — é o que congela o
 *   progresso enquanto o resgate está pendente;
 * - **subtração** (revisão do tutor em conquistas `MANUAL`) tem piso em 0 e
 *   continua valendo mesmo com a conquista desbloqueada — é o que permite
 *   revogar o desbloqueio.
 *
 * Função pura (isomórfica): usada pelos três caminhos de escrita
 * (`evaluateAchievements`, `EARNED_POINTS` e `adjustAchievementProgress`) para
 * que a trava seja a mesma em todos.
 */
export function applyAchievementProgress(
  current: number,
  target: number,
  amount: number
): number {
  return amount < 0
    ? Math.max(0, current + amount)
    : capAchievementProgress(current + amount, target)
}

/** Linha de progresso mínima para avaliar a disponibilidade de resgate. */
export type ClaimableProgress = {
  level: number | null
  unlocked_at: string | null
} | null

/**
 * Há recompensa **disponível para resgate**? Verdadeiro só quando a conquista
 * está desbloqueada (`unlocked_at`) e ainda não foi resgatada:
 * - REPETÍVEL: resgatável a cada ciclo — o resgate limpa o `unlocked_at`, então
 *   basta estar desbloqueada (vale também nos níveis acima do cap);
 * - ÚNICA: só no nível 1 — depois do resgate o `level` vai a 2 e vira
 *   "Concluída" (mesma regra do guard `.eq('level', 1)` de
 *   `claimAchievementReward`).
 *
 * Fonte única da verdade: usada nos cards do dependente, no badge dourado da nav
 * e no cálculo do servidor.
 */
export function isAchievementClaimable(
  progress: ClaimableProgress,
  isRepeatable: boolean
): boolean {
  if (!progress?.unlocked_at) return false
  return isRepeatable || (progress.level ?? 1) === 1
}
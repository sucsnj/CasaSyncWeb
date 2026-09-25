export type AchievementMetricType = 'COMPLETED_TASKS' | 'EARNED_POINTS'

export const ACHIEVEMENT_METRIC_TYPES: AchievementMetricType[] = [
  'COMPLETED_TASKS',
  'EARNED_POINTS',
]

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
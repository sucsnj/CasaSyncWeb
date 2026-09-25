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
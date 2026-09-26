import type { AchievementMetricType } from './achievements'

/**
 * Colunas de `dependent_stats` que alimentam as conquistas. `EARNED_POINTS` é
 * volátil (somado no momento da aprovação, sem coluna) e `MANUAL` é concedido
 * pelo ADMIN — as duas não estão neste mapa. Módulo puro (não `'use server'`):
 * valores exportados não são transmitíveis a partir de arquivos de actions.
 */
export type DependentStatColumns = {
  tasks_approved_count: number
  tasks_rejected_count: number
  rewards_claimed_count: number
  custom_rewards_approved_count: number
  app_login_days_count: number
  streak_login_days: number
}

export type StatColumnName = keyof DependentStatColumns

export const DEPENDENT_STAT_COLUMNS: Partial<
  Record<AchievementMetricType, StatColumnName>
> = {
  TASKS_APPROVED: 'tasks_approved_count',
  TASKS_REJECTED: 'tasks_rejected_count',
  REWARDS_CLAIMED: 'rewards_claimed_count',
  CUSTOM_REWARDS_APPROVED: 'custom_rewards_approved_count',
  APP_LOGIN_DAYS: 'app_login_days_count',
  STREAK_LOGIN_DAYS: 'streak_login_days',
}
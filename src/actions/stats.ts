'use server'

import { createAdminClient } from '@/utils/supabase/admin'
import { syncAchievementProgress } from '@/utils/achievement-progress'
import {
  DEPENDENT_STAT_COLUMNS,
  type DependentStatColumns,
  type StatColumnName,
} from '@/utils/dependent-stats'
import type { AchievementMetricType } from '@/utils/achievements'

type StatsRow = DependentStatColumns & {
  profile_id: string
  house_id: string
  last_login_day: string | null
}

function statPatch(
  column: StatColumnName,
  value: number
): Partial<DependentStatColumns> {
  return { [column]: value } as Partial<DependentStatColumns>
}

/** Dia (e ontem) em America/Recife no formato YYYY-MM-DD — fuso fixo, sem DST. */
function recifeDay(offsetDays: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Recife',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000))
}

/**
 * Incrementa o contador de `metricType` do dependente em `dependent_stats`
 * (lazy insert da linha) e re-sincroniza as conquistas da casa que medem essa
 * métrica via `evaluateAchievements`. BEST-EFFORT: nunca lança — uma falha aqui
 * não derruba a ação principal; o progresso volta na próxima ocorrência.
 */
export async function incrementDependentStat(
  houseId: string,
  profileId: string,
  metricType: AchievementMetricType,
  amount = 1
): Promise<void> {
  const column = DEPENDENT_STAT_COLUMNS[metricType]
  if (!column) return

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return
  }

  try {
    const { data: row } = await admin
      .from('dependent_stats')
      .select(
        'profile_id, house_id, last_login_day, tasks_approved_count, tasks_rejected_count, rewards_claimed_count, custom_rewards_approved_count, app_login_days_count, streak_login_days'
      )
      .eq('profile_id', profileId)
      .maybeSingle()

    if (!row) {
      await admin
        .from('dependent_stats')
        .insert({
          profile_id: profileId,
          house_id: houseId,
          ...statPatch(column, amount),
        })
    } else {
      let current = row
      for (let attempt = 0; attempt < 2; attempt++) {
        const nextValue = current[column] + amount
        const { data: updated, error } = await admin
          .from('dependent_stats')
          .update({
            ...statPatch(column, nextValue),
            house_id: houseId,
            updated_at: new Date().toISOString(),
          })
          .eq('profile_id', profileId)
          .eq(column, current[column])
          .select('profile_id')

        if (error) {
          console.error('[STATS] Falha ao incrementar estatística:', error)
          return
        }
        if (updated && updated.length > 0) break

        if (attempt === 0) {
          const { data: fresh } = await admin
            .from('dependent_stats')
            .select(
              'profile_id, house_id, last_login_day, tasks_approved_count, tasks_rejected_count, rewards_claimed_count, custom_rewards_approved_count, app_login_days_count, streak_login_days'
            )
            .eq('profile_id', profileId)
            .maybeSingle()
          if (!fresh) return
          current = fresh
        }
      }
    }
  } catch (err) {
    console.error('[STATS] Falha ao incrementar estatística:', err)
    return
  }

  await evaluateAchievements(houseId, profileId, metricType)
}

/**
 * Re-sincroniza `dependent_achievements.current_progress` com o contador de
 * `dependent_stats` do dependente, para todas as conquistas da casa que medem
 * `metricType`:
 *
 * - REPETÍVEL: progresso do ciclo = contador − (nível−1) × objetivo (o excedente
 *   de cada ciclo consumido é o que já foi resgatado). Best-effort: progresso
 *   nunca diminui abaixo do registrado (preserva histórico pré-estatísticas).
 * - ÚNICA: progresso = min(contador, objetivo), sem cap de display.
 *
 * `unlocked_at` só é marcado quando o progresso cruza o objetivo e não está já
 * definido. BEST-EFFORT.
 */
export async function evaluateAchievements(
  houseId: string,
  profileId: string,
  metricType: AchievementMetricType
): Promise<void> {
  const column = DEPENDENT_STAT_COLUMNS[metricType]
  if (!column) return

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return
  }

  const { data } = await admin
    .from('dependent_stats')
    .select(column)
    .eq('profile_id', profileId)
    .maybeSingle()

  const row = data as StatsRow | null
  if (!row) return

  const counter = row[column]

  await syncAchievementProgress(houseId, profileId, metricType, (achievement, existing) => {
    const target = achievement.target_count
    const raw = achievement.is_repeatable
      ? Math.max(0, counter - ((existing?.level ?? 1) - 1) * target)
      : Math.min(counter, target)

    const progress = existing
      ? Math.max(existing.current_progress, raw)
      : raw

    const unlockedAt =
      existing?.unlocked_at ?? (progress >= target ? new Date().toISOString() : null)

    return { progress, unlockedAt }
  })
}

/**
 * Conta o acesso diário do dependente (métrica APP_LOGIN_DAYS + STREAK_LOGIN_DAYS),
 * com "dia" no fuso America/Recife. Idempotente por dia: só incrementa quando
 * `last_login_day` difere de hoje; o streak continua quando ontem foi registrado
 * e reseta para 1 após um dia sem acesso. Disparado best-effort nos renders
 * dependentes (dashboard, tasks, rewards, conquistas).
 */
export async function registerLoginDay(
  houseId: string,
  profileId: string
): Promise<void> {
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return
  }

  try {
    const today = recifeDay(0)
    const yesterday = recifeDay(-1)

    const { data: row } = await admin
      .from('dependent_stats')
      .select(
        'profile_id, house_id, last_login_day, app_login_days_count, streak_login_days'
      )
      .eq('profile_id', profileId)
      .maybeSingle()

    if (row && row.last_login_day === today) return

    const now = new Date().toISOString()

    if (!row) {
      await admin.from('dependent_stats').insert({
        profile_id: profileId,
        house_id: houseId,
        app_login_days_count: 1,
        streak_login_days: 1,
        last_login_day: today,
        updated_at: now,
      })
    } else {
      const nextDays = (row.app_login_days_count ?? 0) + 1
      const nextStreak =
        row.last_login_day === yesterday
          ? (row.streak_login_days ?? 0) + 1
          : 1

      let query = admin
        .from('dependent_stats')
        .update({
          app_login_days_count: nextDays,
          streak_login_days: nextStreak,
          last_login_day: today,
          house_id: houseId,
          updated_at: now,
        })
        .eq('profile_id', profileId)

      query =
        row.last_login_day !== null
          ? query.eq('last_login_day', row.last_login_day)
          : query.is('last_login_day', null)

      const { data: updated } = await query.select('profile_id')

      // Outra aba do mesmo dia contou primeiro — não duplica.
      if (!updated || updated.length === 0) return
    }
  } catch (err) {
    console.error('[STATS] Falha ao registrar acesso diário:', err)
    return
  }

  await evaluateAchievements(houseId, profileId, 'APP_LOGIN_DAYS')
  await evaluateAchievements(houseId, profileId, 'STREAK_LOGIN_DAYS')
}
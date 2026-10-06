'use server'

import { createAdminClient } from '@/utils/supabase/admin'
import { syncAchievementProgress } from '@/utils/achievement-progress'
import { getHouseTimezoneSettings } from '@/utils/house-settings'
import { timeServer } from '@/utils/perf'
import { zonedDay } from '@/utils/timezone'
import {
  DEPENDENT_STAT_COLUMNS,
  type DependentStatColumns,
  type StatColumnName,
} from '@/utils/dependent-stats'
import {
  applyAchievementProgress,
  capAchievementProgress,
  type AchievementMetricType,
} from '@/utils/achievements'

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

/**
 * Dia (e ontem) no **fuso da casa** (chave `house_timezone`), no formato
 * YYYY-MM-DD. Dia-contagem da Streak: uma casa em outro fuso fecha o dia em
 * horário diferente do Recife, e é o dia *dela* que conta.
 */
function houseDay(timeZone: string, offsetDays: number): string {
  return zonedDay(timeZone, offsetDays)
}

/**
 * Incrementa o contador de `metricType` do dependente em `dependent_stats`
 * (lazy insert da linha) e re-sincroniza as conquistas da casa que medem essa
 * métrica via `evaluateAchievements`. `actorId` é quem disparou (o ADMIN que
 * aprovou/concedeu) — usado na notificação de desbloqueio. `amount` é a
 * ocorrência deste evento (vai para o progresso do ciclo em andamento). BEST-EFFORT: nunca
 * lança — uma falha aqui não derruba a ação principal; o progresso volta na
 * próxima ocorrência.
 */
export async function incrementDependentStat(
  houseId: string,
  profileId: string,
  metricType: AchievementMetricType,
  amount = 1,
  actorId?: string
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

  await evaluateAchievements(houseId, profileId, metricType, amount, actorId)
}

/**
 * Re-sincroniza `dependent_achievements.current_progress` para todas as
 * conquistas da casa que medem `metricType`:
 *
 * - REPETÍVEL: o progresso é **do ciclo em andamento**, somado a partir do valor
 *   gravado e com **teto no objetivo** (`applyAchievementProgress`) — enquanto a
 *   conquista está desbloqueada e não resgatada, o progresso fica congelado em
 *   `N/N` e o excedente é descartado, então o ciclo seguinte só volta a contar
 *   depois do resgate. Só a **primeira** ocorrência da conquista usa o contador
 *   absoluto (histórico anterior conta, como nas únicas). Best-effort.
 * - ÚNICA: progresso = `min(contador, objetivo)` (o teto é a própria regra),
 *   preservando o piso histórico: nunca diminui abaixo do registrado.
 *
 * `unlocked_at` só é marcado quando o progresso cruza o objetivo e não está já
 * definido — e essa transição dispara a notificação de desbloqueio
 * (`actorId` = quem disparou). BEST-EFFORT.
 */
export async function evaluateAchievements(
  houseId: string,
  profileId: string,
  metricType: AchievementMetricType,
  amount = 1,
  actorId?: string
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

    let progress: number
    if (achievement.is_repeatable && existing) {
      // Ciclo em andamento: incremental com trava no objetivo.
      progress = applyAchievementProgress(existing.current_progress, target, amount)
    } else if (achievement.is_repeatable) {
      // Primeira ocorrência: o histórico do contador alimenta o 1º ciclo.
      progress = capAchievementProgress(counter, target)
    } else {
      progress = Math.min(
        Math.max(existing?.current_progress ?? 0, counter),
        target
      )
    }

    const unlockedAt =
      existing?.unlocked_at ?? (progress >= target ? new Date().toISOString() : null)

    return { progress, unlockedAt }
  }, { actorId })
}

/**
 * Conta o acesso diário do dependente (métrica APP_LOGIN_DAYS + STREAK_LOGIN_DAYS),
 * com "dia" no **fuso da casa** (chave `house_timezone`, default America/Recife).
 * Idempotente por dia: só incrementa quando `last_login_day` difere de hoje; o
 * streak continua quando ontem foi registrado e reseta para 1 após um dia sem
 * acesso. Disparado best-effort nos renders dependentes (dashboard, tasks,
 * rewards, conquistas).
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

  // Blocos medidos por instrumentação TEMPORÁRIA (ver `src/utils/perf.ts`): esta
  // função é `await` no render das 4 telas do dependente, e no primeiro acesso do
  // dia ela deixa de dar early-return e vira escrita + avaliações.
  try {
    const { timezone } = await timeServer('login-dia/timezone', () =>
      getHouseTimezoneSettings(houseId)
    )
    const today = houseDay(timezone, 0)
    const yesterday = houseDay(timezone, -1)

    const { data: row } = await timeServer('login-dia/leitura', () =>
      admin
        .from('dependent_stats')
        .select(
          'profile_id, house_id, last_login_day, app_login_days_count, streak_login_days'
        )
        .eq('profile_id', profileId)
        .maybeSingle()
    )

    if (row && row.last_login_day === today) return

    const now = new Date().toISOString()

    if (!row) {
      await timeServer('login-dia/gravação', () =>
        admin.from('dependent_stats').insert({
          profile_id: profileId,
          house_id: houseId,
          app_login_days_count: 1,
          streak_login_days: 1,
          last_login_day: today,
          updated_at: now,
        })
      )
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

      const { data: updated } = await timeServer('login-dia/gravação', () =>
        query.select('profile_id')
      )

      // Outra aba do mesmo dia contou primeiro — não duplica.
      if (!updated || updated.length === 0) return
    }
  } catch (err) {
    console.error('[STATS] Falha ao registrar acesso diário:', err)
    return
  }

  await timeServer('login-dia/conquistas', async () => {
    await evaluateAchievements(houseId, profileId, 'APP_LOGIN_DAYS', 1)
    await evaluateAchievements(houseId, profileId, 'STREAK_LOGIN_DAYS', 1)
  })
}
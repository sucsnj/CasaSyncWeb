import { createAdminClient } from '@/utils/supabase/admin'
import type { AchievementMetricType } from './achievements'

/**
 * Meteria de uma conquista, no shape mínimo que o sync precisa.
 */
export type AchievementMeta = {
  id: string
  target_count: number
  is_repeatable: boolean
}

/**
 * Linha lida de `dependent_achievements` (guarda do update atômico).
 */
export type ExistingProgressRow = {
  id: string
  achievement_id: string
  level: number
  current_progress: number
  unlocked_at: string | null
}

export type ProgressWrite = {
  progress: number
  unlockedAt: string | null
}

/**
 * Centraliza a gravação de progresso em `dependent_achievements` para todas as
 * conquistas da casa que medem `metricType`: lazy insert (nível 1) na primeira
 * ocorrência e update atômico por linha com guard `.eq('current_progress', valor
 * lido)` + 1 retry relendo — duas escritas concorrentes não perdem incremento.
 *
 * `compute` decide o valor novo a partir da conquista e da linha atual
 * (`null` quando ainda não existe). BEST-EFFORT: nunca lança — uma falha aqui
 * não derruba a ação principal (uma nova ocorrência re-sincroniza).
 */
export async function syncAchievementProgress(
  houseId: string,
  profileId: string,
  metricType: AchievementMetricType,
  compute: (
    achievement: AchievementMeta,
    existing: ExistingProgressRow | null
  ) => ProgressWrite
): Promise<void> {
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return
  }

  try {
    const { data: achievements } = await admin
      .from('achievements')
      .select('id, target_count, is_repeatable')
      .eq('house_id', houseId)
      .eq('metric_type', metricType)
    if (!achievements?.length) return

    const ids = achievements.map((achievement) => achievement.id)
    const { data: existing } = await admin
      .from('dependent_achievements')
      .select('id, achievement_id, level, current_progress, unlocked_at')
      .in('achievement_id', ids)
      .eq('profile_id', profileId)

    const existingMap = new Map(
      (existing ?? []).map((row) => [row.achievement_id, row])
    )

    const now = new Date().toISOString()

    const toInsert: Array<{
      achievement_id: string
      profile_id: string
      house_id: string
      level: number
      current_progress: number
      unlocked_at: string | null
      updated_at: string
    }> = []

    for (const achievement of achievements) {
      const row = existingMap.get(achievement.id)
      if (row) continue

      const write = compute(achievement, null)
      toInsert.push({
        achievement_id: achievement.id,
        profile_id: profileId,
        house_id: houseId,
        level: 1,
        current_progress: write.progress,
        unlocked_at: write.unlockedAt,
        updated_at: now,
      })
    }

    if (toInsert.length > 0) {
      const { error: insertError } = await admin
        .from('dependent_achievements')
        .insert(toInsert)
      if (insertError) {
        console.error('[ACHIEVEMENTS] Falha ao criar progresso:', insertError)
      }
    }

    for (const achievement of achievements) {
      const existingRow = existingMap.get(achievement.id)
      if (!existingRow) continue

      let row: ExistingProgressRow = existingRow

      for (let attempt = 0; attempt < 2; attempt++) {
        const write = compute(achievement, row)

        const { data: updatedRows, error } = await admin
          .from('dependent_achievements')
          .update({
            current_progress: write.progress,
            unlocked_at: write.unlockedAt,
            updated_at: now,
          })
          .eq('id', row.id)
          .eq('current_progress', row.current_progress)
          .select('id')

        if (error) {
          console.error('[ACHIEVEMENTS] Falha ao atualizar progresso:', error)
          break
        }
        if (updatedRows && updatedRows.length > 0) break

        if (attempt === 0) {
          const { data: fresh } = await admin
            .from('dependent_achievements')
            .select('id, achievement_id, level, current_progress, unlocked_at')
            .eq('id', row.id)
            .maybeSingle()
          if (!fresh) break
          row = fresh as ExistingProgressRow
        }
      }
    }
  } catch (err) {
    console.error('[ACHIEVEMENTS] Falha ao registrar progresso:', err)
  }
}
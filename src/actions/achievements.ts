'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/utils/supabase/admin'
import {
  getActiveAdminHouse,
  getDependentHouse,
  getSessionProfile,
} from '@/utils/house'
import {
  ACHIEVEMENT_ICONS,
  ACHIEVEMENT_METRIC_TYPES,
  type AchievementMetricType,
} from '@/utils/achievements'
import { POINTS_MAX, type ActionResult } from './types'
import type { Database, Tables } from '@/types/database'

type Achievement = Tables<'achievements'>

/**
 * Verifica (via service role) que o ADMIN controla a casa ativa como membro
 * `house_members.role='ADMIN'`. Autorização sempre deriva da sessão.
 */
async function assertAdminCanManage(
  admin: ReturnType<typeof createAdminClient>,
  houseId: string
): Promise<{ ok: true; adminId: string } | { ok: false; error: string }> {
  const { user, profile } = await getSessionProfile()

  if (!user || profile?.user_role !== 'ADMIN') {
    return { ok: false, error: 'Apenas administradores podem executar esta ação.' }
  }

  const { data: membership } = await admin
    .from('house_members')
    .select('id')
    .eq('house_id', houseId)
    .eq('profile_id', user.id)
    .eq('role', 'ADMIN')
    .maybeSingle()

  if (!membership) {
    return { ok: false, error: 'Casa não encontrada ou sem permissão.' }
  }

  return { ok: true, adminId: user.id }
}

function validateAchievementFields(input: {
  title: string
  rewardPoints: number
  targetCount: number
  metricType: AchievementMetricType
  isRepeatable: boolean
  isSecret: boolean
  icon: string | null
}): string | null {
  if (!input.title.trim()) return 'Informe o título da conquista.'
  if (input.title.trim().length > 100) return 'Título muito longo (máximo 100 caracteres).'

  if (!Number.isInteger(input.rewardPoints) || input.rewardPoints < 0) {
    return 'A recompensa deve ser um inteiro maior ou igual a zero.'
  }
  if (input.rewardPoints > POINTS_MAX) {
    return `A recompensa deve ficar entre 0 e ${POINTS_MAX}.`
  }
  if (!Number.isInteger(input.targetCount) || input.targetCount < 1) {
    return 'O objetivo deve ser um inteiro de no mínimo 1.'
  }
  if (input.targetCount > 1_000_000) {
    return 'O objetivo é alto demais (máximo 1.000.000).'
  }
  if (!ACHIEVEMENT_METRIC_TYPES.includes(input.metricType)) {
    return 'Métrica inválida.'
  }
  if (input.icon && !(ACHIEVEMENT_ICONS as readonly string[]).includes(input.icon)) {
    return 'Ícone inválido.'
  }
  return null
}

/**
 * ADMIN cria uma conquista para a casa ativa. A progressão é medida por
 * `metric_type`: tarefas aprovadas (`COMPLETED_TASKS`) ou pontos creditados em
 * aprovações (`EARNED_POINTS`). Pontos da conquista são apenas "marca de
 * recompensa" — o `task_decay` não os reduz.
 */
export async function createAchievement(
  input: {
    title: string
    description: string | null
    icon: string | null
    rewardPoints: number
    targetCount: number
    metricType: AchievementMetricType
    isRepeatable: boolean
    isSecret: boolean
  }
): Promise<ActionResult<{ achievement: Achievement }>> {
  const activeHouse = await getActiveAdminHouse()
  if (!activeHouse) return { ok: false, error: 'Crie ou selecione uma casa primeiro.' }

  const admin = createAdminClient()
  const auth = await assertAdminCanManage(admin, activeHouse.id)
  if (!auth.ok) return auth

  const validation = validateAchievementFields(input)
  if (validation) return { ok: false, error: validation }

  const now = new Date().toISOString()
  const { data: achievementRow, error } = await admin
    .from('achievements')
    .insert({
      house_id: activeHouse.id,
      title: input.title.trim(),
      description: input.description?.trim() ? input.description.trim() : null,
      icon: input.icon,
      reward_points: input.rewardPoints,
      target_count: input.targetCount,
      metric_type: input.metricType,
      is_repeatable: input.isRepeatable,
      is_secret: input.isSecret,
      created_by: auth.adminId,
      created_at: now,
      updated_at: now,
    })
    .select('*')
    .single()

  if (error || !achievementRow) {
    return { ok: false, error: 'Falha ao criar a conquista.' }
  }

  revalidatePath('/achievements')
  return {
    ok: true,
    data: { achievement: achievementRow },
    message: `Conquista "${achievementRow.title}" criada.`,
  }
}

export type AchievementPatch = {
  title?: string
  description?: string | null
  icon?: string | null
  rewardPoints?: number
  targetCount?: number
  metricType?: AchievementMetricType
  isRepeatable?: boolean
  isSecret?: boolean
}

/**
 * ADMIN edita uma conquista da casa ativa. Só aceita campos da whitelist; a
 * progressão já registrada de um nível NÃO é recalculada retroativamente.
 */
export async function updateAchievement(
  achievementId: string,
  patch: AchievementPatch
): Promise<ActionResult> {
  const activeHouse = await getActiveAdminHouse()
  if (!activeHouse) return { ok: false, error: 'Selecione uma casa primeiro.' }

  const admin = createAdminClient()
  const auth = await assertAdminCanManage(admin, activeHouse.id)
  if (!auth.ok) return auth

  const { data: achievement } = await admin
    .from('achievements')
    .select('house_id')
    .eq('id', achievementId)
    .maybeSingle()

  if (!achievement || achievement.house_id !== activeHouse.id) {
    return { ok: false, error: 'Conquista não encontrada nesta casa.' }
  }

  const validation = validateAchievementFields({
    title: patch.title ?? 'placeholder',
    rewardPoints: patch.rewardPoints ?? 0,
    targetCount: patch.targetCount ?? 1,
    metricType: patch.metricType ?? 'COMPLETED_TASKS',
    isRepeatable: patch.isRepeatable ?? false,
    isSecret: patch.isSecret ?? false,
    icon: patch.icon ?? null,
  })
  if (validation) return { ok: false, error: validation }

  const updates: Database['public']['Tables']['achievements']['Update'] = {
    updated_at: new Date().toISOString(),
  }
  if (patch.title !== undefined) updates.title = patch.title.trim()
  if (patch.description !== undefined) {
    updates.description = patch.description?.trim() ? patch.description.trim() : null
  }
  if (patch.icon !== undefined) updates.icon = patch.icon
  if (patch.rewardPoints !== undefined) updates.reward_points = patch.rewardPoints
  if (patch.targetCount !== undefined) updates.target_count = patch.targetCount
  if (patch.metricType !== undefined) updates.metric_type = patch.metricType
  if (patch.isRepeatable !== undefined) updates.is_repeatable = patch.isRepeatable
  if (patch.isSecret !== undefined) updates.is_secret = patch.isSecret

  const { error } = await admin
    .from('achievements')
    .update(updates)
    .eq('id', achievementId)
  if (error) return { ok: false, error: 'Falha ao salvar a conquista.' }

  revalidatePath('/achievements')
  return { ok: true, message: 'Conquista atualizada.' }
}

/**
 * ADMIN apaga uma conquista da casa ativa. O progresso dos dependentes morre
 * junto (`dependent_achievements.achievement_id` é `on delete cascade`).
 */
export async function deleteAchievement(
  achievementId: string
): Promise<ActionResult> {
  const activeHouse = await getActiveAdminHouse()
  if (!activeHouse) return { ok: false, error: 'Selecione uma casa primeiro.' }

  const admin = createAdminClient()
  const auth = await assertAdminCanManage(admin, activeHouse.id)
  if (!auth.ok) return auth

  const { data: achievement } = await admin
    .from('achievements')
    .select('house_id, title')
    .eq('id', achievementId)
    .maybeSingle()

  if (!achievement || achievement.house_id !== activeHouse.id) {
    return { ok: false, error: 'Conquista não encontrada nesta casa.' }
  }

  const { error } = await admin
    .from('achievements')
    .delete()
    .eq('id', achievementId)
  if (error) return { ok: false, error: 'Falha ao excluir a conquista.' }

  revalidatePath('/achievements')
  return { ok: true, message: `Conquista "${achievement.title}" excluída.` }
}

/**
 * Soma `amount` à métrica `metricType` de `profileId` em todas as conquistas
 * da casa que medem essa métrica. Cria a linha de progresso na primeira
 * ocorrência (lazy upsert) e marca `unlocked_at` assim que o objetivo é
 * atingido. BEST-EFFORT: uma falha aqui nunca derruba a ação principal
 * (aprovação/conclusão de tarefa) — o progresso volta na próxima aprovação.
 *
 * Uso: `approveTask`/`adminCompleteTask` chamam para `COMPLETED_TASKS` (amount
 * 1) e `EARNED_POINTS` (amount = pontos creditados).
 */
type ProgressScan = {
  id: string
  achievement_id: string
  current_progress: number
  unlocked_at: string | null
}

export async function registerAchievementProgress(
  houseId: string,
  profileId: string,
  metricType: AchievementMetricType,
  amount: number
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
      .select('id, target_count')
      .eq('house_id', houseId)
      .eq('metric_type', metricType)
    if (!achievements?.length) return

    const ids = achievements.map((achievement) => achievement.id)
    const { data: existing } = await admin
      .from('dependent_achievements')
      .select('id, achievement_id, current_progress, unlocked_at')
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
      if (!row) {
        toInsert.push({
          achievement_id: achievement.id,
          profile_id: profileId,
          house_id: houseId,
          level: 1,
          current_progress: amount,
          unlocked_at: amount >= achievement.target_count ? now : null,
          updated_at: now,
        })
      }
    }

    if (toInsert.length > 0) {
      const { error: insertError } = await admin
        .from('dependent_achievements')
        .insert(toInsert)
      if (insertError) {
        console.error('[ACHIEVEMENTS] Falha ao criar progresso:', insertError)
      }
    }

    // Updates atômicos por linha: só muda o progresso se a linha ainda tiver o
    // valor lido (duas aprovações concorrentes não perdem incremento). Se o
    // guard bater em 0 linhas, relê e reaplica uma vez.
    for (const achievement of achievements) {
      const existingRow = existingMap.get(achievement.id)
      if (!existingRow) continue

      let row: ProgressScan = existingRow

      for (let attempt = 0; attempt < 2; attempt++) {
        const nextProgress = row.current_progress + amount
        const nextUnlocked =
          !row.unlocked_at && nextProgress >= achievement.target_count
            ? now
            : row.unlocked_at

        const { data: updatedRows, error } = await admin
          .from('dependent_achievements')
          .update({
            current_progress: nextProgress,
            unlocked_at: nextUnlocked,
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
            .select('id, achievement_id, current_progress, unlocked_at')
            .eq('id', row.id)
            .maybeSingle()
          if (!fresh) break
          row = fresh as ProgressScan
        }
      }
    }
  } catch (err) {
    console.error('[ACHIEVEMENTS] Falha ao registrar progresso:', err)
  }
}

/**
 * DEPENDENTE resgata a recompensa de pontos de uma conquista desbloqueada da
 * própria casa. O "nível" sobe a cada resgate:
 *
 * - REPETÍVEL: o contador zera (mantendo o excedente) e `unlocked_at` volta a
 *   `null` — a conquista pode ser re-desbloqueada no próximo ciclo.
 * - NÃO repetível: só dá para resgatar uma vez no nível 1; depois disso vira
 *   "Concluída" (chip) e o botão some.
 *
 * Atomicidade: a linha de progresso avança com guard no `unlocked_at` lido
 * (repetível) ou no `level == 1` (não repetível) — duas janelas não resgatam o
 * mesmo desbloqueio. Falha no crédito revierte a linha.
 */
export async function claimAchievementReward(
  achievementId: string
): Promise<ActionResult<{ points: number; nextLevel: number }>> {
  const { user, profile } = await getSessionProfile()
  if (!user || profile?.user_role !== 'DEPENDENT') {
    return { ok: false, error: 'Apenas dependentes podem resgatar conquistas.' }
  }

  const house = await getDependentHouse(user.id)
  if (!house) return { ok: false, error: 'Você ainda não está vinculado a uma casa.' }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return { ok: false, error: 'Configuração do servidor indisponível.' }
  }

  const { data: achievement } = await admin
    .from('achievements')
    .select('id, house_id, reward_points, target_count, is_repeatable')
    .eq('id', achievementId)
    .maybeSingle()

  if (!achievement || achievement.house_id !== house.id) {
    return { ok: false, error: 'Conquista não encontrada na sua casa.' }
  }

  const { data: row } = await admin
    .from('dependent_achievements')
    .select('id, level, current_progress, unlocked_at')
    .eq('achievement_id', achievementId)
    .eq('profile_id', user.id)
    .maybeSingle()

  if (!row || row.unlocked_at === null) {
    return { ok: false, error: 'Você ainda não atingiu o objetivo desta conquista.' }
  }

  const alreadyClaimed = !achievement.is_repeatable && row.level > 1
  if (alreadyClaimed) {
    return { ok: false, error: 'Esta conquista já foi resgatada.' }
  }

  const now = new Date().toISOString()
  const nextLevel = row.level + 1

  const update =
    achievement.is_repeatable
      ? {
          level: nextLevel,
          current_progress: Math.max(0, row.current_progress - achievement.target_count),
          unlocked_at: null,
          updated_at: now,
        }
      : { level: nextLevel, updated_at: now }

  const { data: updated, error } = await admin
    .from('dependent_achievements')
    .update(update)
    .eq('id', row.id)
    .eq(
      achievement.is_repeatable ? 'unlocked_at' : 'level',
      achievement.is_repeatable ? row.unlocked_at : row.level
    )
    .select('id')

  if (error || !updated || updated.length === 0) {
    return { ok: false, error: 'Esta conquista já foi resgatada por outra janela.' }
  }

  // Credita a recompensa. Sem serviço de crédito compartilhado aqui, o ponto
  // a mais vai direto ao saldo — o mesmo ajuste de `approveTask`.
  const { data: dependent } = await admin
    .from('profiles')
    .select('points')
    .eq('id', user.id)
    .maybeSingle()

  if (!dependent) {
    await admin.from('dependent_achievements').update(row).eq('id', row.id)
    return { ok: false, error: 'Perfil não encontrado. Crédito revertido.' }
  }

  const { error: pointsError } = await admin
    .from('profiles')
    .update({ points: dependent.points + achievement.reward_points })
    .eq('id', user.id)

  if (pointsError) {
    // Rollback: devolve a linha ao estado anterior ao resgate.
    await admin.from('dependent_achievements').update(row).eq('id', row.id)
    return { ok: false, error: 'Falha ao creditar pontos. Ação revertida.' }
  }

  revalidatePath('/achievements')
  revalidatePath('/rewards')
  revalidatePath('/dashboard/dependent')

  return {
    ok: true,
    data: { points: achievement.reward_points, nextLevel },
    message: `${achievement.reward_points} ponto(s) creditados — você subiu para o nível ${nextLevel}.`,
  }
}
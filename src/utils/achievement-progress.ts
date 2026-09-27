import { cache } from 'react'
import { createAdminClient } from '@/utils/supabase/admin'
import { notifyHouse, notifyUser } from '@/utils/notifications'
import { isAchievementClaimable, type AchievementMetricType } from './achievements'

/**
 * Meteria de uma conquista, no shape mínimo que o sync precisa (`title` entra
 * para a notificação de desbloqueio).
 */
export type AchievementMeta = {
  id: string
  title: string
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

export type SyncAchievementOptions = {
  /**
   * Restringe a gravação a **uma** conquista: é o que o ajuste manual do tutor
   * usa (um `+1`/`−1` numa conquista `MANUAL` não pode mexer nas outras `MANUAL`
   * da casa). Sem o parâmetro vale o comportamento dos eventos automáticos — um
   * único evento conta para todas as conquistas da casa com a mesma métrica.
   */
  onlyAchievementId?: string
  /**
   * Quem disparou o registro (o ADMIN que aprovou/concedeu). Usado como
   * `actor_id` da notificação e para excluir o autor da lista de ADMINs
   * notificados. Quando ausente, o próprio dependente é tratado como autor.
   */
  actorId?: string
}

/**
 * O dependente tem alguma conquista **desbloqueada e ainda não resgatada**?
 * Alimenta o item "Conquistas" da nav (badge dourado = há resgate disponível).
 *
 * Só as linhas já desbloqueadas do próprio dependente entram na consulta
 * (`unlocked_at` não nulo) e, para decidir entre repetível/única, uma segunda
 * query busca a `is_repeatable` **das conquistas envolvidas** — não há como
 * derivar isso da linha de progresso. Memoizado por request (`React.cache`).
 */
export const hasClaimableAchievement = cache(
  async (profileId: string): Promise<boolean> => {
    let admin: ReturnType<typeof createAdminClient>
    try {
      admin = createAdminClient()
    } catch {
      return false
    }

    try {
      const { data: rows } = await admin
        .from('dependent_achievements')
        .select('achievement_id, level, unlocked_at')
        .eq('profile_id', profileId)
        .not('unlocked_at', 'is', null)

      if (!rows?.length) return false

      const { data: metas } = await admin
        .from('achievements')
        .select('id, is_repeatable')
        .in(
          'id',
          rows.map((row) => row.achievement_id)
        )

      return rows.some((row) => {
        const meta = metas?.find((item) => item.id === row.achievement_id)
        return meta
          ? isAchievementClaimable(row, meta.is_repeatable)
          : false
      })
    } catch (err) {
      console.error('[ACHIEVEMENTS] Falha ao verificar resgates disponíveis:', err)
      return false
    }
  }
)

/**
 * Conquistas que ficaram desbloqueadas nesta gravação. `level`/`isRepeatable`
 * entram para não notificar o que não tem resgate disponível (única já resgatada
 * que o tutor re-desbloqueou, por exemplo).
 */
type UnlockedAchievement = {
  id: string
  title: string
  level: number
  isRepeatable: boolean
  unlockedAt: string
}

/**
 * Avisa o desbloqueio na central de notificações dos DOIS lados: o dependente
 * ("você desbloqueou…") e os ADMINs da casa ("fulano desbloqueou…", excluindo
 * quem agiu). Best-effort: notificação nunca derruba o registro de progresso.
 */
async function notifyUnlocked(
  admin: ReturnType<typeof createAdminClient>,
  houseId: string,
  profileId: string,
  actorId: string | undefined,
  unlocked: UnlockedAchievement[]
): Promise<void> {
  // Só interessa o que virou recompensa resgatável (ver `isAchievementClaimable`).
  const claimable = unlocked.filter((achievement) =>
    isAchievementClaimable(
      { level: achievement.level, unlocked_at: achievement.unlockedAt },
      achievement.isRepeatable
    )
  )
  if (claimable.length === 0) return

  try {
    const { data: profile } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', profileId)
      .maybeSingle()

    const dependentName = profile?.full_name ?? 'O dependente'

    for (const achievement of claimable) {
      await notifyUser(admin, {
        houseId,
        recipientId: profileId,
        actorId: actorId ?? profileId,
        type: 'ACHIEVEMENT_UNLOCKED',
        title: 'Conquista desbloqueada!',
        body: `Você desbloqueou "${achievement.title}". Vá resgatar a recompensa.`,
        link: '/achievements',
      })

      await notifyHouse(
        admin,
        {
          houseId,
          side: 'ADMINS',
          actorId: actorId ?? profileId,
          excludeUserId: actorId,
          type: 'ACHIEVEMENT_UNLOCKED',
          title: 'Conquista desbloqueada',
          body: `${dependentName} desbloqueou "${achievement.title}".`,
          link: '/achievements',
        }
      )
    }
  } catch (err) {
    console.error('[ACHIEVEMENTS] Falha ao notificar desbloqueio:', err)
  }
}

/**
 * Centraliza a gravação de progresso em `dependent_achievements` para as
 * conquistas da casa que medem `metricType`: lazy insert (nível 1) na primeira
 * ocorrência e update atômico por linha com guard `.eq('current_progress', valor
 * lido)` + 1 retry relendo — duas escritas concorrentes não perdem incremento.
 *
 * `compute` decide o valor novo a partir da conquista e da linha atual
 * (`null` quando ainda não existe). BEST-EFFORT: nunca lança — uma falha aqui
 * não derruba a ação principal (uma nova ocorrência re-sincroniza).
 *
 * Efeito colateral: a transição **"não desbloqueada → desbloqueada"** dispara a
 * notificação `ACHIEVEMENT_UNLOCKED` para o dependente e para os ADMINs da casa
 * (ver `notifyUnlocked`).
 */
export async function syncAchievementProgress(
  houseId: string,
  profileId: string,
  metricType: AchievementMetricType,
  compute: (
    achievement: AchievementMeta,
    existing: ExistingProgressRow | null
  ) => ProgressWrite,
  options?: SyncAchievementOptions
): Promise<void> {
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return
  }

  const onlyAchievementId = options?.onlyAchievementId
  const actorId = options?.actorId
  const unlocked: UnlockedAchievement[] = []

  try {
    let achievementsQuery = admin
      .from('achievements')
      .select('id, title, target_count, is_repeatable')
      .eq('house_id', houseId)
      .eq('metric_type', metricType)

    if (onlyAchievementId) {
      achievementsQuery = achievementsQuery.eq('id', onlyAchievementId)
    }

    const { data: achievements } = await achievementsQuery
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

    // Primeira ocorrência da conquista: nasce já desbloqueada quando o objetivo
    // é atingido de uma vez (ex.: `EARNED_POINTS` com muita pontuação).
    const insertedUnlocked: UnlockedAchievement[] = []

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
      if (write.unlockedAt) {
        insertedUnlocked.push({
          id: achievement.id,
          title: achievement.title,
          level: 1,
          isRepeatable: achievement.is_repeatable,
          unlockedAt: write.unlockedAt,
        })
      }
    }

    if (toInsert.length > 0) {
      const { error: insertError } = await admin
        .from('dependent_achievements')
        .insert(toInsert)
      if (insertError) {
        console.error('[ACHIEVEMENTS] Falha ao criar progresso:', insertError)
      } else {
        unlocked.push(...insertedUnlocked)
      }
    }

    for (const achievement of achievements) {
      const existingRow = existingMap.get(achievement.id)
      if (!existingRow) continue

      let row: ExistingProgressRow = existingRow

      for (let attempt = 0; attempt < 2; attempt++) {
        const write = compute(achievement, row)
        // Só é desbloqueamento o cruzamento de "sem `unlocked_at`" para "com".
        const justUnlocked = !row.unlocked_at && Boolean(write.unlockedAt)

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
        if (updatedRows && updatedRows.length > 0) {
          if (justUnlocked && write.unlockedAt) {
            unlocked.push({
              id: achievement.id,
              title: achievement.title,
              level: row.level,
              isRepeatable: achievement.is_repeatable,
              unlockedAt: write.unlockedAt,
            })
          }
          break
        }

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

  await notifyUnlocked(admin, houseId, profileId, actorId, unlocked)
}

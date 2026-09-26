'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PartyPopper } from 'lucide-react'
import { cn } from '@/lib/utils'
import { claimAchievementReward } from '@/actions/achievements'
import {
  achievementRewardAtLevel,
  maxAchievementLevel,
  METRIC_LABELS,
} from '@/utils/achievements'
import { usePostgresChanges } from '@/hooks/use-postgres-changes'
import { AchievementIcon } from './achievement-icon'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { Tables } from '@/types/database'

type Achievement = Tables<'achievements'>

export type DependentAchievementProgress = {
  level: number
  current_progress: number
  unlocked_at: string | null
}

export type AchievementView = {
  achievement: Achievement
  progress: DependentAchievementProgress | null
}

const METRIC_LABEL: Record<string, string> = METRIC_LABELS

export function AchievementsDependent({
  houseId,
  initialViews,
}: {
  houseId: string
  userId: string
  initialViews: AchievementView[]
}) {
  const router = useRouter()
  const [views, setViews] = useState<AchievementView[]>(initialViews)
  const [claimingId, setClaimingId] = useState<string | null>(null)

  // Realtime: quando o ADMIN aprova uma tarefa em outra aba, o progresso aqui
  // acompanha sozinho (e a página re-sincroniza o saldo no `router.refresh`).
  usePostgresChanges<{
    id: string
    achievement_id: string
    level: number
    current_progress: number
    unlocked_at: string | null
  }>({
    table: 'dependent_achievements',
    event: 'UPDATE',
    filter: `house_id=eq.${houseId}`,
    onUpsert: (row) => {
      setViews((prev) =>
        prev.map((view) =>
          view.achievement.id === row.achievement_id
            ? {
                ...view,
                progress: {
                  level: row.level,
                  current_progress: row.current_progress,
                  unlocked_at: row.unlocked_at,
                },
              }
            : view
        )
      )
    },
  })

  async function handleClaim(view: AchievementView) {
    if (claimingId) return
    setClaimingId(view.achievement.id)
    try {
      const res = await claimAchievementReward(view.achievement.id)
      if (!res.ok || !res.data) {
        toast.error(res.ok ? 'Conquista indisponível no momento.' : res.error)
        return
      }
      const { nextLevel } = res.data

      setViews((prev) =>
        prev.map((entry) => {
          if (entry.achievement.id !== view.achievement.id || !entry.progress) {
            return entry
          }
          const { target_count, is_repeatable } = view.achievement
          const progress = is_repeatable
            ? {
                level: nextLevel,
                current_progress: Math.max(
                  0,
                  entry.progress.current_progress - target_count
                ),
                unlocked_at: null as string | null,
              }
            : {
                level: nextLevel,
                current_progress: entry.progress.current_progress,
                unlocked_at: entry.progress.unlocked_at,
              }
          return { ...entry, progress }
        })
      )

      toast.success(res.message)
      router.refresh()
    } catch {
      toast.error('Falha ao resgatar a conquista.')
    } finally {
      setClaimingId(null)
    }
  }

  if (views.length === 0) {
    return (
      <Card className="border-dashed text-center">
        <div className="flex flex-col items-center gap-3 p-10">
          <span className="flex size-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <AchievementIcon icon="trophy" className="size-7" />
          </span>
          <p className="font-medium text-slate-700">Nenhuma conquista ainda…</p>
          <p className="text-sm text-slate-500">
            Seu responsável pode criar conquistas para a casa te premiar.
          </p>
        </div>
      </Card>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {views.map((view) => {
        const { achievement, progress } = view
        const lockedSecret = achievement.is_secret && !progress

        if (lockedSecret) {
          return (
            <Card
              key={achievement.id}
              className="flex flex-col gap-3 border-slate-200/80 p-4"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                  <AchievementIcon icon={achievement.icon} className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-800">
                    Conquista secreta
                  </p>
                  <p className="text-sm text-slate-500">…</p>
                </div>
              </div>
              <p className="text-sm text-slate-500">
                Continue cumprindo tarefas na casa para descobrir do que se
                trata.
              </p>
            </Card>
          )
        }

        const level = progress?.level ?? 1
        const unlocked = progress?.unlocked_at !== undefined && progress?.unlocked_at !== null
        const claimed = !achievement.is_repeatable && level > 1
        const claimable = unlocked && !claimed
        const target = achievement.target_count
        const maxLevel = maxAchievementLevel(
          achievement.is_repeatable,
          achievement.max_level
        )
        const reward = achievementRewardAtLevel(
          achievement.reward_points,
          level,
          achievement.level_multiplier
        )
        const percent = progress
          ? Math.min(100, Math.round((progress.current_progress / target) * 100))
          : 0

        return (
          <Card
            key={achievement.id}
            className={cn(
              'flex flex-col gap-3 p-4',
              unlocked
                ? 'border-amber-200 bg-amber-50/40'
                : 'border-slate-200/80'
            )}
          >
            <div className="flex items-center gap-3">
              {achievement.image_url ? (
                <img
                  src={achievement.image_url}
                  alt=""
                  className={cn(
                    'size-10 shrink-0 rounded-xl border border-slate-200 object-cover shadow-sm',
                    unlocked && 'border-amber-300'
                  )}
                />
              ) : (
                <span
                  className={cn(
                    'flex size-10 shrink-0 items-center justify-center rounded-xl',
                    unlocked
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-sky-100 text-sky-700'
                  )}
                >
                  <AchievementIcon icon={achievement.icon} className="size-5" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-800">
                  {achievement.title}
                </p>
                <p className="truncate text-sm text-slate-500">
                  {METRIC_LABEL[achievement.metric_type]}
                </p>
              </div>
              <span className={cn(
                'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold',
                claimed
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-indigo-100 text-indigo-700'
              )}>
                {claimed
                  ? 'Concluída'
                  : achievement.is_repeatable
                    ? `Nível ${level}/${maxLevel}`
                    : `Nível ${level}`}
              </span>
            </div>

            {achievement.description ? (
              <p className="text-sm text-slate-600">{achievement.description}</p>
            ) : null}

            <div className="flex items-center justify-between gap-2">
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-sm font-bold text-amber-700">
                +{reward} pts
              </span>
              {achievement.level_multiplier !== 1 ? (
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                  ×{achievement.level_multiplier} por nível
                </span>
              ) : null}
              {unlocked && !claimed ? (
                <span className="flex items-center gap-1 text-xs font-semibold text-amber-700">
                  <PartyPopper className="size-4" /> Desbloqueada!
                </span>
              ) : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-amber-400 transition-all duration-300"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <p className="text-xs text-slate-500">
                {progress
                  ? `${progress.current_progress} / ${target}`
                  : `0 / ${target}`}
              </p>
            </div>

            {claimable ? (
              <Button
                type="button"
                className="w-full bg-amber-500 text-slate-900 shadow-amber-500/25 hover:bg-amber-600"
                onClick={() => handleClaim(view)}
                disabled={claimingId !== null}
              >
                {claimingId === achievement.id
                  ? 'Resgatando…'
                  : `Resgatar +${reward} PTS`}
              </Button>
            ) : claimed ? (
              <p className="text-center text-xs text-emerald-600">
                Conquista resgatada. 🎉
              </p>
            ) : null}
          </Card>
        )
      })}
    </div>
  )
}
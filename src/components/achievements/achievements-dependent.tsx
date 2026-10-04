'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Lock, PartyPopper, Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { claimAchievementReward } from '@/actions/achievements'
import {
  achievementRewardAtLevel,
  capAchievementProgress,
  isAchievementClaimable,
  maxAchievementLevel,
} from '@/utils/achievements'
import { setClaimableAchievements } from '@/hooks/use-claimable-achievement'
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

  // Publica "há resgate disponível?" para o badge dourado do item "Conquistas"
  // da nav: é esta tela que tem a lista completa (inclusive `is_repeatable`),
  // então o valor é exato e muda junto com o resgate (otimista) e com o
  // Realtime — sem esperar `router.refresh()`.
  const hasClaimable = useMemo(
    () =>
      views.some((view) =>
        isAchievementClaimable(view.progress, view.achievement.is_repeatable)
      ),
    [views]
  )

  useEffect(() => {
    setClaimableAchievements(hasClaimable)
  }, [hasClaimable])

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
          const { is_repeatable } = view.achievement
          // Resgate consumiu o ciclo inteiro: o próximo começa em 0 (o
          // progresso era travado no objetivo, não havia excedente).
          const progress = is_repeatable
            ? {
                level: nextLevel,
                current_progress: 0,
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
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {views.map((view) => {
        const { achievement, progress } = view

        // Sigilosa revela **individualmente**, no desbloqueio dela: todas as
        // conquistas da métrica ganham linha de progresso no primeiro evento
        // (inclusive as secretas), então "ter linha" não revela nada — só o
        // `unlocked_at` daquela conquista (ou já ter sido resgatada, para a
        // repetível não sumir de novo no rollover).
        const revealed =
          !achievement.is_secret ||
          (progress != null &&
            (progress.unlocked_at !== null || progress.level > 1))

        if (!revealed) {
          return (
            <Card
              key={achievement.id}
              className="flex flex-col gap-3 border-slate-200/80 p-4"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                  <Trophy className="size-5" />
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
        // Mesma regra do badge dourado da nav e do guard do resgate.
        const claimable = isAchievementClaimable(
          progress,
          achievement.is_repeatable
        )
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
          ? Math.min(
              100,
              Math.round(
                (capAchievementProgress(progress.current_progress, target) / target) * 100
              )
            )
          : 0
        // Exibição travada no objetivo (protege linhas gravadas antes da regra).
        const shownProgress = capAchievementProgress(
          progress?.current_progress ?? 0,
          target
        )

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
                <p className="truncate text-base font-bold leading-snug text-slate-900">
                  {achievement.title}
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

            {/* Rodapé ancorado na base do card: recompensa, progresso e a ação
                de resgatar descem juntos até o fim, então o botão não fica
                grudado no texto (com um vão vazio depois dele). `mt-auto` só
                empurra quando o card estica — quando não há espaço extra ele
                vira 0 e o `gap-3` do pai segue dando o respiro. Isto NÃO é o
                `mt-auto` proibido no `AGENTS.md` §2: aqui ele ancora o rodapé
                DENTRO do próprio card, não força altura igual entre vizinhos. */}
            <div className="mt-auto flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-sm font-bold text-amber-700">
                  +{reward} pts
                </span>
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
                <p
                  className={cn(
                    'text-xs',
                    claimable
                      ? 'flex items-center gap-1 font-semibold text-amber-700'
                      : 'text-slate-500'
                  )}
                >
                  {claimable ? (
                    <>
                      <Lock className="size-3.5 shrink-0" />
                      {shownProgress} / {target} · travado até resgatar
                    </>
                  ) : (
                    `${shownProgress} / ${target}`
                  )}
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
            </div>
          </Card>
        )
      })}
    </div>
  )
}

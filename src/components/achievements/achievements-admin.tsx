'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Minus, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  adjustAchievementProgress,
  createAchievement,
  deleteAchievement,
  resetAchievementProgress,
  updateAchievement,
} from '@/actions/achievements'
import {
  ACHIEVEMENT_ICONS,
  METRIC_LABELS,
  type AchievementMetricType,
  achievementRewardAtLevel,
  applyAchievementProgress,
  capAchievementProgress,
  maxAchievementLevel,
} from '@/utils/achievements'
import { AchievementIcon } from './achievement-icon'
import { Button } from '@/components/ui/button'
import {
  DEFAULT_TEXT_LIMITS,
  type TextLimitsSettings,
} from '@/utils/settings'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ClearableInput } from '@/components/ui/clearable-input'
import { CharCounter } from '@/components/ui/limited-textarea'
import { Input } from '@/components/ui/input'
import { ImageUpload } from '@/components/ui/image-upload'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { usePostgresChanges } from '@/hooks/use-postgres-changes'
import type { Tables } from '@/types/database'

type Achievement = Tables<'achievements'>
type DependentAchievement = Tables<'dependent_achievements'>

type AchievementProgressEntry = {
  id: string
  achievement_id: string
  profile_id: string
  level: number
  current_progress: number
  unlocked_at: string | null
}

type AchievementForm = {
  title: string
  description: string
  icon: string | null
  imageUrl: string | null
  rewardPoints: string
  targetCount: string
  metricType: AchievementMetricType
  isRepeatable: boolean
  maxLevel: string
  levelMultiplier: string
  isSecret: boolean
}

const EMPTY_FORM: AchievementForm = {
  title: '',
  description: '',
  icon: 'trophy',
  imageUrl: null,
  rewardPoints: '10',
  targetCount: '5',
  metricType: 'TASKS_APPROVED',
  isRepeatable: true,
  maxLevel: '10',
  levelMultiplier: '1',
  isSecret: false,
}

const METRIC_OPTIONS: Array<{ value: AchievementMetricType; label: string }> = [
  { value: 'TASKS_APPROVED', label: 'Tarefas aprovadas' },
  { value: 'TASKS_REJECTED', label: 'Tarefas reprovadas na revisão' },
  { value: 'REWARDS_CLAIMED', label: 'Recompensas resgatadas' },
  { value: 'CUSTOM_REWARDS_APPROVED', label: 'Sugestões aprovadas' },
  { value: 'APP_LOGIN_DAYS', label: 'Dias de acesso ao app' },
  { value: 'STREAK_LOGIN_DAYS', label: 'Dias seguidos no app' },
  { value: 'EARNED_POINTS', label: 'Pontos ganhos em aprovações' },
  { value: 'MANUAL', label: 'Concessão manual pelo tutor' },
]

export function AchievementsAdmin({
  houseId,
  initialAchievements,
  dependents,
  initialProgress,
  textLimits,
}: {
  houseId: string
  initialAchievements: Achievement[]
  dependents: { id: string; full_name: string }[]
  initialProgress: AchievementProgressEntry[]
  /** Teto de caracteres da descrição (0 = sem limite) - settings.casa. */
  textLimits?: TextLimitsSettings
}) {
  const limits = textLimits ?? DEFAULT_TEXT_LIMITS
  const [achievements, setAchievements] = useState<Achievement[]>(
    initialAchievements
  )
  const [progress, setProgress] = useState<AchievementProgressEntry[]>(
    initialProgress
  )
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<AchievementForm>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Achievement | null>(null)
  const [adjustingKey, setAdjustingKey] = useState<string | null>(null)
  // Alvo do "zerar contagem": pedido de confirmação antes de revogar o progresso
  // (e o desbloqueio) que o dependente acumulou.
  const [resetTarget, setResetTarget] = useState<{
    achievement: Achievement
    profileId: string
    dependentName: string
    progress: number
  } | null>(null)
  // O form fica no topo da lista: ao editar um card mais abaixo, a tela rola
  // até ele e o foco cai no título (pronto para digitar).
  const formRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  // Realtime: conquistas/progresso criados/alterados por outro ADMIN ou pelas
  // aprovações de tarefas chegam ao vivo (confere também no `router.refresh`).
  usePostgresChanges<Achievement>({
    table: 'achievements',
    filter: `house_id=eq.${houseId}`,
    onUpsert: (row) => {
      setAchievements((prev) => {
        const exists = prev.some((item) => item.id === row.id)
        return exists
          ? prev.map((item) => (item.id === row.id ? row : item))
          : [row, ...prev]
      })
    },
    onDelete: (id) => {
      setAchievements((prev) => prev.filter((item) => item.id !== id))
    },
  })

  usePostgresChanges<DependentAchievement>({
    table: 'dependent_achievements',
    filter: `house_id=eq.${houseId}`,
    onUpsert: (row) => {
      setProgress((prev) => {
        // Reconcilia por (conquista, dependente): a linha pode ter nascido de um
        // ajuste otimista (id sintético) e precisa ser substituída pela real.
        const index = prev.findIndex(
          (item) =>
            item.achievement_id === row.achievement_id &&
            item.profile_id === row.profile_id
        )
        if (index === -1) return [...prev, row]
        const next = [...prev]
        next[index] = row
        return next
      })
    },
    onDelete: (id) => {
      setProgress((prev) => prev.filter((item) => item.id !== id))
    },
  })

  const progressMap = useMemo(() => {
    const map = new Map<string, Map<string, AchievementProgressEntry>>()
    for (const entry of progress) {
      const byProfile =
        map.get(entry.achievement_id) ?? new Map<string, AchievementProgressEntry>()
      byProfile.set(entry.profile_id, entry)
      map.set(entry.achievement_id, byProfile)
    }
    return map
  }, [progress])

  // Ao abrir o form (criar ou editar), a tela rola até ele — que fica no topo da
  // lista, longe do card editado — e o foco cai no título, pronto para digitar.
  // `editingId` na dependência cobre trocar de card em edição sem fechar o form.
  useEffect(() => {
    if (!showForm) return
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    titleRef.current?.focus({ preventScroll: true })
  }, [showForm, editingId])

  function startCreate() {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setShowForm(true)
  }

  function startEdit(achievement: Achievement) {
    setForm({
      title: achievement.title,
      description: achievement.description ?? '',
      icon: achievement.icon,
      imageUrl: achievement.image_url,
      rewardPoints: String(achievement.reward_points),
      targetCount: String(achievement.target_count),
      metricType: achievement.metric_type,
      isRepeatable: achievement.is_repeatable,
      maxLevel: String(achievement.max_level),
      levelMultiplier: String(achievement.level_multiplier),
      isSecret: achievement.is_secret,
    })
    setEditingId(achievement.id)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
  }

  async function handleSubmit() {
    if (submitting) return
    const rewardPoints = Number(form.rewardPoints)
    const targetCount = Number(form.targetCount)
    const maxLevel = form.isRepeatable ? Number(form.maxLevel) : 1
    const payload = {
      title: form.title,
      description: form.description || null,
      icon: form.icon,
      imageUrl: form.imageUrl,
      rewardPoints,
      targetCount,
      metricType: form.metricType,
      isRepeatable: form.isRepeatable,
      maxLevel,
      levelMultiplier: Number(form.levelMultiplier),
      isSecret: form.isSecret,
    }

    setSubmitting(true)
    try {
      if (editingId) {
        const res = await updateAchievement(editingId, payload)
        if (!res.ok) {
          toast.error(res.error)
          return
        }
        const entry = payload
        setAchievements((prev) =>
          prev.map((item) =>
            item.id === editingId
              ? {
                ...item,
                title: entry.title.trim(),
                description: entry.description,
                icon: entry.icon,
                image_url: entry.imageUrl,
                reward_points: entry.rewardPoints,
                target_count: entry.targetCount,
                metric_type: entry.metricType,
                is_repeatable: entry.isRepeatable,
                max_level: entry.maxLevel,
                level_multiplier: entry.levelMultiplier,
                is_secret: entry.isSecret,
              }
              : item
          )
        )
        toast.success(res.message ?? 'Conquista atualizada.')
      } else {
        const res = await createAchievement(payload)
        if (!res.ok) {
          toast.error(res.error)
          return
        }
        const created = res.data?.achievement
        if (created) {
          setAchievements((prev) =>
            prev.some((item) => item.id === created.id)
              ? prev
              : [...prev, created]
          )
        }
        toast.success(res.message ?? 'Conquista criada.')
      }
      closeForm()
    } catch {
      toast.error('Falha ao salvar a conquista.')
    } finally {
      setSubmitting(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    const target = deleteTarget
    setSubmitting(true)
    try {
      const res = await deleteAchievement(target.id)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setAchievements((prev) => prev.filter((item) => item.id !== target.id))
      setProgress((prev) =>
        prev.filter((item) => item.achievement_id !== target.id)
      )
      toast.success(res.message ?? 'Conquista excluída.')
    } catch {
      toast.error('Falha ao excluir a conquista.')
    } finally {
      setSubmitting(false)
      setDeleteTarget(null)
    }
  }

  /**
   * Aplica o `+1`/`−1` no estado local na hora (sem esperar o Realtime, que nem
   * sempre entrega o próprio write) — a UI responde no clique. O `unlocked_at` e
   * o `level` ficam por conta do valor autoritativo devolvido pela action.
   */
  function applyOptimisticProgress(
    achievementId: string,
    profileId: string,
    delta: 1 | -1,
    targetCount: number
  ) {
    setProgress((prev) => {
      const index = prev.findIndex(
        (item) =>
          item.achievement_id === achievementId && item.profile_id === profileId
      )

      if (index === -1) {
        if (delta < 0) return prev
        return [
          ...prev,
          {
            id: `optimistic:${achievementId}:${profileId}`,
            achievement_id: achievementId,
            profile_id: profileId,
            level: 1,
            current_progress: capAchievementProgress(delta, targetCount),
            unlocked_at: null,
          },
        ]
      }

      const next = [...prev]
      next[index] = {
        ...next[index],
        current_progress: applyAchievementProgress(
          next[index].current_progress,
          targetCount,
          delta
        ),
      }
      return next
    })
  }

  /**
   * Substitui a linha pelo valor autoritativo devolvido pela action (destrava o
   * chip, o nível e a barra exatamente como ficaram gravados).
   */
  function mergeProgressSnapshot(
    achievementId: string,
    profileId: string,
    saved: { level: number; current_progress: number; unlocked_at: string | null }
  ) {
    setProgress((prev) => {
      const index = prev.findIndex(
        (item) =>
          item.achievement_id === achievementId && item.profile_id === profileId
      )
      if (index === -1) return prev
      const next = [...prev]
      next[index] = { ...next[index], ...saved }
      return next
    })
  }

  async function handleAdjust(
    achievement: Achievement,
    profileId: string,
    delta: 1 | -1
  ) {
    if (adjustingKey) return
    const snapshot = progress
    setAdjustingKey(`${achievement.id}:${profileId}:${delta}`)
    applyOptimisticProgress(
      achievement.id,
      profileId,
      delta,
      achievement.target_count
    )
    try {
      const res = await adjustAchievementProgress(achievement.id, profileId, delta)
      if (!res.ok) {
        setProgress(snapshot)
        toast.error(res.error)
        return
      }

      const saved = res.data?.progress
      if (saved) mergeProgressSnapshot(achievement.id, profileId, saved)

      toast.success(res.message ?? 'Progresso ajustado.')
    } catch {
      setProgress(snapshot)
      toast.error('Falha ao ajustar o progresso.')
    } finally {
      setAdjustingKey(null)
    }
  }

  async function handleReset() {
    if (!resetTarget || adjustingKey) return
    const { achievement, profileId } = resetTarget
    const snapshot = progress
    setAdjustingKey(`${achievement.id}:${profileId}:reset`)
    // Otimista: a barra vai a 0 na hora. O `unlocked_at` sai no valor real.
    mergeProgressSnapshot(achievement.id, profileId, {
      level:
        progress.find(
          (item) =>
            item.achievement_id === achievement.id && item.profile_id === profileId
        )?.level ?? 1,
      current_progress: 0,
      unlocked_at: null,
    })
    try {
      const res = await resetAchievementProgress(achievement.id, profileId)
      if (!res.ok) {
        setProgress(snapshot)
        toast.error(res.error)
        return
      }

      const saved = res.data?.progress
      if (saved) mergeProgressSnapshot(achievement.id, profileId, saved)

      toast.success(res.message ?? 'Contagem zerada.')
    } catch {
      setProgress(snapshot)
      toast.error('Falha ao zerar a contagem.')
    } finally {
      setAdjustingKey(null)
      setResetTarget(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Conquistas da casa</CardTitle>
            <CardDescription>
              Crie metas que premiam os dependentes por tarefas aprovadas ou
              pontos ganhos. Cada conquista pode ser resgatada pelo dependente
              quando o objetivo é atingido.
            </CardDescription>
          </div>
          {!showForm ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={startCreate}
            >
              <Plus className="size-4" /> Nova conquista
            </Button>
          ) : null}
        </CardHeader>
      </Card>

      {showForm ? (
        <Card
          ref={formRef}
          className="scroll-mt-24 border-indigo-200 bg-indigo-50/30"
        >
          <div className="flex flex-col gap-4 p-4">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-slate-800">
                {editingId ? 'Editar conquista' : 'Nova conquista'}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={closeForm}
                aria-label="Fechar formulário"
              >
                <X className="size-4" />
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="ach-title">Título</Label>
                <ClearableInput
                  id="ach-title"
                  ref={titleRef}
                  value={form.title}
                  maxLength={100}
                  onChange={(event) =>
                    setForm({ ...form, title: event.target.value })
                  }
                  placeholder="Ex.: Estrela da casa"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ach-description">Descrição (opcional)</Label>
                <ClearableInput
                  id="ach-description"
                  value={form.description}
                  maxLength={limits.achievementDescription > 0 ? limits.achievementDescription : undefined}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                  placeholder="Ex.: Aprove 10 tarefas para desbloquear"
                />
                <CharCounter
                  value={form.description}
                  limit={limits.achievementDescription}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="ach-reward">Recompensa base (pts)</Label>
                <Input
                  id="ach-reward"
                  type="number"
                  min={0}
                  value={form.rewardPoints}
                  onChange={(event) =>
                    setForm({ ...form, rewardPoints: event.target.value })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ach-target">Objetivo (quantidade)</Label>
                <Input
                  id="ach-target"
                  type="number"
                  min={1}
                  value={form.targetCount}
                  onChange={(event) =>
                    setForm({ ...form, targetCount: event.target.value })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ach-metric">Métrica do progresso</Label>
                <select
                  id="ach-metric"
                  value={form.metricType}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      metricType: event.target.value as AchievementMetricType,
                    })
                  }
                  className="min-h-12 w-full min-w-0 rounded-xl border border-input bg-white px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
                >
                  {METRIC_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label
                  htmlFor="ach-maxlevel"
                  className={cn(
                    form.isRepeatable ? 'text-slate-700' : 'text-slate-400'
                  )}
                >
                  Nível máximo (repetível)
                </Label>
                <Input
                  id="ach-maxlevel"
                  type="number"
                  min={1}
                  max={1000}
                  value={form.isRepeatable ? form.maxLevel : '1'}
                  disabled={!form.isRepeatable}
                  onChange={(event) =>
                    setForm({ ...form, maxLevel: event.target.value })
                  }
                />
                <p className="text-xs text-slate-500">
                  {form.isRepeatable
                    ? 'A cada ciclo o dependente sobe 1 nível; no máximo, segue repetível pagando essa recompensa.'
                    : 'Conquistas únicas resgatam uma vez no nível 1.'}
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ach-mult">Multiplicador por nível</Label>
                <Input
                  id="ach-mult"
                  type="number"
                  min={0}
                  step={0.25}
                  value={form.levelMultiplier}
                  onChange={(event) =>
                    setForm({ ...form, levelMultiplier: event.target.value })
                  }
                />
                <p className="text-xs text-slate-500">
                  Pontos por nível = recompensa × nível × multiplicador
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Ícone</Label>
              <div className="flex flex-wrap gap-2">
                {ACHIEVEMENT_ICONS.map((icon) => {
                  const selected = form.icon === icon
                  return (
                    <button
                      key={icon}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setForm({ ...form, icon })}
                      className={cn(
                        'flex size-10 items-center justify-center rounded-xl border transition-all duration-200 active:scale-95',
                        selected
                          ? 'border-indigo-400 bg-indigo-100 text-indigo-700'
                          : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-100'
                      )}
                    >
                      <AchievementIcon icon={icon} />
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 sm:items-start">
              <div className="flex flex-col gap-2">
                <Label>Imagem como ícone (opcional)</Label>
                <ImageUpload
                  folder="achievements"
                  ownerId={houseId}
                  value={form.imageUrl}
                  onChange={(url) => setForm({ ...form, imageUrl: url })}
                  label="Enviar imagem"
                />
                <p className="text-xs text-slate-500">
                  Quando definida, a imagem substitui o ícone de símbolo nos
                  cards (para o dependente e para o ADMIN). Envie uma imagem
                  quadrada (PNG/JPG/WEBP).
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Opções</Label>
                <Label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.isRepeatable}
                    onChange={(event) =>
                      setForm({ ...form, isRepeatable: event.target.checked })
                    }
                    className="size-4 rounded border-slate-300 accent-indigo-600"
                  />
                  Repetível (pode resgatar de novo a cada ciclo)
                </Label>
                <Label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.isSecret}
                    onChange={(event) =>
                      setForm({ ...form, isSecret: event.target.checked })
                    }
                    className="size-4 rounded border-slate-300 accent-indigo-600"
                  />
                  Secreta (escondida até desbloquear)
                </Label>
              </div>
            </div>

            <Button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !form.title.trim()}
            >
              {submitting
                ? 'Salvando…'
                : editingId
                  ? 'Salvar alterações'
                  : 'Criar conquista'}
            </Button>
          </div>
        </Card>
      ) : null}

      {achievements.length === 0 ? (
        <Card className="border-dashed text-center">
          <div className="flex flex-col items-center gap-3 p-10">
            <span className="flex size-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <AchievementIcon icon="trophy" className="size-7" />
            </span>
            <p className="font-medium text-slate-700">Nenhuma conquista ainda…</p>
            <p className="text-sm text-slate-500">
              Crie a primeira conquista para motivar os dependentes da casa.
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {achievements.map((achievement) => {
            const byProfile = progressMap.get(achievement.id)
            // **Ganho atual** de cada dependente: pts base × nível × multiplicador
            // (a mesma fórmula de `claimAchievementReward`), arredondado igual no
            // crédito — então o número aqui é o número que entra no saldo.
            //
            // O nível entra **capado**, e isso não é cosmético: a ÚNICA vai para
            // `level = 2` depois de resgatada mas só paga no nível 1 (sem o cap
            // o card mostraria o dobro do que ela nunca mais recebe), e a
            // repetível travada no `max_level` continua pagando o valor máximo.
            const levelCap = maxAchievementLevel(
              achievement.is_repeatable,
              achievement.max_level
            )
            const rewardAtLevel = (level: number) =>
              achievementRewardAtLevel(
                achievement.reward_points,
                Math.min(Math.max(level, 1), levelCap),
                achievement.level_multiplier
              )
            return (
              <Card key={achievement.id}>
                <div className="flex flex-col gap-3 p-4">
                  <div className="flex items-center gap-3">
                    {achievement.image_url ? (
                      <img
                        src={achievement.image_url}
                        alt=""
                        className="size-10 shrink-0 rounded-xl border border-slate-200 object-cover shadow-sm"
                      />
                    ) : (
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                        <AchievementIcon
                          icon={achievement.icon}
                          className="size-5"
                        />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-slate-800">
                        {achievement.title}
                      </p>
                      <p className="truncate text-sm text-slate-500">
                        {achievement.is_secret ? 'Sigilosa · ' : ''}
                        {METRIC_LABELS[achievement.metric_type]}
                        {' · +'}
                        {achievement.reward_points} pts base
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        onClick={() => startEdit(achievement)}
                        aria-label={`Editar ${achievement.title}`}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-red-500 hover:bg-red-50 hover:text-red-600"
                        onClick={() => setDeleteTarget(achievement)}
                        aria-label={`Excluir ${achievement.title}`}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>

                  {achievement.description ? (
                    <p className="text-sm text-slate-600">
                      {achievement.description}
                    </p>
                  ) : null}

                  <div className="flex flex-wrap gap-1.5 text-xs">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                      Objetivo: {achievement.target_count}
                    </span>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-700">
                      Recompensa: +{achievement.reward_points} pts base
                    </span>
                    {achievement.level_multiplier !== 1 ? (
                      <span className="rounded-full bg-indigo-100 px-2 py-0.5 font-medium text-indigo-700">
                        ×{achievement.level_multiplier} por nível
                      </span>
                    ) : null}
                    {achievement.is_repeatable ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                        Repetível · Nível máx: {achievement.max_level}
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                        Única
                      </span>
                    )}
                    {achievement.is_secret ? (
                      <span className="rounded-full bg-indigo-100 px-2 py-0.5 font-medium text-indigo-700">
                        Secreta
                      </span>
                    ) : null}
                  </div>

                  {/* Progresso sempre visível: o toggle de expandir/colapsar foi
                      removido — o tutor vê o estado de cada dependente sem
                      clicar em nada. */}
                  <div className="flex flex-col gap-2 border-t border-slate-100 pt-3">
                    <p className="text-sm font-medium text-slate-700">
                      Progresso por dependente
                    </p>
                    {dependents.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        Nenhum dependente vinculado à casa ainda.
                      </p>
                    ) : (
                      dependents.map((dependent) => {
                        const entry = byProfile?.get(dependent.id)
                        return (
                          <div
                            key={dependent.id}
                            className="flex items-center justify-between gap-2 text-sm"
                          >
                            <span className="min-w-0 truncate text-slate-700">
                              {dependent.full_name}
                            </span>
                            {entry ? (
                              <span className="flex shrink-0 items-center gap-2">
                                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                                  {achievement.is_repeatable
                                    ? `Nível ${entry.level}/${achievement.max_level}`
                                    : `Nível ${entry.level}`}
                                </span>
                                {/* Ganho atual: base × nível × multiplicador,
                                    arredondado como o crédito. */}
                                <span
                                  className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700"
                                  title={`Ganho atual no nível ${entry.level}: ${achievement.reward_points} × ${entry.level} × ${achievement.level_multiplier} = ${rewardAtLevel(entry.level)} pts`}
                                >
                                  +{rewardAtLevel(entry.level)} pts
                                </span>
                                <span className="text-xs text-slate-500">
                                  {capAchievementProgress(
                                    entry.current_progress,
                                    achievement.target_count
                                  )}
                                  /{achievement.target_count}
                                </span>
                                {entry.unlocked_at ? (
                                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                                    {achievement.is_repeatable ||
                                      entry.level === 1
                                      ? 'Desbloqueada'
                                      : 'Concluída'}
                                  </span>
                                ) : null}
                                {achievement.metric_type === 'MANUAL' ? (
                                  <span className="flex items-center gap-1">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-7 w-7 p-0"
                                      title="Retirar 1 do progresso (revoga o desbloqueio se ficar abaixo do objetivo)"
                                      disabled={
                                        adjustingKey !== null ||
                                        entry.current_progress <= 0
                                      }
                                      onClick={() =>
                                        handleAdjust(achievement, dependent.id, -1)
                                      }
                                    >
                                      <Minus className="size-3.5" />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-7 w-7 p-0"
                                      title="Conceder 1 de progresso"
                                      disabled={
                                        adjustingKey !== null ||
                                        capAchievementProgress(
                                          entry.current_progress,
                                          achievement.target_count
                                        ) >= achievement.target_count
                                      }
                                      onClick={() =>
                                        handleAdjust(achievement, dependent.id, 1)
                                      }
                                    >
                                      <Plus className="size-3.5" />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-7 w-7 p-0 text-rose-600 hover:text-rose-700"
                                      title="Zerar a contagem (revoga o desbloqueio se houver)"
                                      disabled={
                                        adjustingKey !== null ||
                                        entry.current_progress <= 0
                                      }
                                      onClick={() =>
                                        setResetTarget({
                                          achievement,
                                          profileId: dependent.id,
                                          dependentName: dependent.full_name,
                                          progress: entry.current_progress,
                                        })
                                      }
                                    >
                                      <RotateCcw className="size-3.5" />
                                    </Button>
                                  </span>
                                ) : null}
                              </span>
                            ) : (
                              <span className="flex shrink-0 items-center gap-2">
                                <span className="text-xs text-slate-400">
                                  Sem progresso
                                </span>
                                {achievement.metric_type === 'MANUAL' ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 w-7 p-0"
                                    title="Conceder 1 de progresso"
                                    disabled={adjustingKey !== null}
                                    onClick={() =>
                                      handleAdjust(achievement, dependent.id, 1)
                                    }
                                  >
                                    <Plus className="size-3.5" />
                                  </Button>
                                ) : null}
                              </span>
                            )}
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Excluir conquista"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-600">
            Excluir esta conquista removerá o progresso de todos os dependentes.
            Essa ação não pode ser desfeita.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmDelete}
              disabled={submitting}
            >
              {submitting ? 'Excluindo…' : 'Excluir'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={resetTarget !== null}
        onClose={() => setResetTarget(null)}
        title="Zerar contagem"
      >
        {resetTarget ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-slate-600">
              A contagem de <strong>{resetTarget.dependentName}</strong> em{' '}
              <strong>{resetTarget.achievement.title}</strong> volta para{' '}
              <strong>
                0/{resetTarget.achievement.target_count}
              </strong>
              .
              {capAchievementProgress(
                resetTarget.progress,
                resetTarget.achievement.target_count
              ) >= resetTarget.achievement.target_count
                ? ' Como a conquista está desbloqueada, o dependente perde o botão de resgate até a meta ser atingida de novo.'
                : ''}
            </p>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setResetTarget(null)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleReset}
                disabled={adjustingKey !== null}
              >
                {adjustingKey !== null ? 'Zerando…' : 'Zerar contagem'}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
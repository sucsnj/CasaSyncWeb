'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  approveRedemption,
  createReward,
  rejectRedemption,
  resolveRewardSuggestion,
  setRewardActive,
  updateReward,
} from '@/actions/rewards'
import { usePostgresChanges } from '@/hooks/use-postgres-changes'
import { useKeyAction } from '@/hooks/use-key-action'
import { useExpandedIds } from '@/hooks/use-expanded-ids'
import type { NotificationRow } from '@/types/notifications'
import type { Tables } from '@/types/database'
import { ImageUpload } from '@/components/ui/image-upload'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { ClearableInput } from '@/components/ui/clearable-input'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Gift, ClipboardList, Layers, Lightbulb, Search, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { parseRichText } from '@/components/ui/rich-text'
import { EmptyState } from '@/components/ui/empty-state'
import { FormattedDateTime } from '@/components/ui/formatted-date'
import {
  DEFAULT_TEXT_LIMITS,
  type TextLimitsSettings,
} from '@/utils/settings'
import { rewardLimitLabel } from '@/utils/reward-limits'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  groupRedemptionsByStatus,
  getRedemptionDisplayDate,
  type RedemptionView,
} from '@/utils/redemptions'

type Reward = Tables<'rewards'>
type Redemption = Tables<'reward_redemptions'>

type SuggestionView = {
  id: string
  title: string
  description: string | null
  points_cost: number | null
  image_url: string | null
  status: Tables<'reward_suggestions'>['status']
  created_at: string
  profileName: string
}

export function RewardsAdmin({
  houseId,
  userId,
  initialRewards,
  initialRedemptions,
  initialSuggestions,
  dependents,
  textLimits,
}: {
  houseId: string
  userId: string
  initialRewards: Reward[]
  initialRedemptions: RedemptionView[]
  initialSuggestions: SuggestionView[]
  dependents: { id: string; full_name: string }[]
  /** Teto de caracteres da descrição (0 = sem limite) - settings.casa. */
  textLimits?: TextLimitsSettings
}) {
  const limits = textLimits ?? DEFAULT_TEXT_LIMITS
  const router = useRouter()
  const [rewards, setRewards] = useState<Reward[]>(initialRewards)
  const [redemptions, setRedemptions] = useState<RedemptionView[]>(
    initialRedemptions
  )
  const [suggestions, setSuggestions] = useState<SuggestionView[]>(
    initialSuggestions
  )
  const [pending, startTransition] = useTransition()
  const [showRewardForm, setShowRewardForm] = useState(false)

  useKeyAction('Escape', () => setShowRewardForm(false), { enabled: showRewardForm })
  const [formError, setFormError] = useState<string | null>(null)
  const [rewardEmoji, setRewardEmoji] = useState<string | null>(null)
  const [rewardImageUrl, setRewardImageUrl] = useState<string | null>(null)
  const [editingReward, setEditingReward] = useState<Reward | null>(null)
  const [editImageUrl, setEditImageUrl] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const { isExpanded, isHydrated, toggle, expand } = useExpandedIds({
    storageKey: `casasync:expanded:rewards-admin:${houseId}`,
  })
  const catalogExpanded = useExpandedIds({
    storageKey: `casasync:expanded:rewards-admin-catalog:${houseId}`,
  })
  const rewardById = useMemo(
    () => new Map(rewards.map((reward) => [reward.id, reward])),
    [rewards]
  )
  const filteredRewards = useMemo(() => {
    const term = search.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    if (!term) return rewards
    return rewards.filter(
      (reward) =>
        reward.title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(term) ||
        (reward.description ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(term)
    )
  }, [rewards, search])
  const dependentNameById = useMemo(
    () => new Map(dependents.map((dependent) => [dependent.id, dependent.full_name])),
    [dependents]
  )

  function toView(row: Redemption): RedemptionView {
    return {
      id: row.id,
      status: row.status,
      points_cost: row.points_cost,
      created_at: row.created_at,
      resolved_at: row.resolved_at,
      rewardTitle: rewardById.get(row.reward_id)?.title ?? 'Recompensa',
      dependentName: dependentNameById.get(row.profile_id) ?? 'Dependente',
      reward_id: row.reward_id,
    }
  }

  usePostgresChanges<Redemption>({
    table: 'reward_redemptions',
    filter: `house_id=eq.${houseId}`,
    onUpsert: (row) =>
      setRedemptions((prev) => {
        const view = toView(row)
        const exists = prev.some((item) => item.id === row.id)
        return exists
          ? prev.map((item) => (item.id === row.id ? view : item))
          : [view, ...prev]
      }),
  })

  // O INSERT do resgate já dispara uma notificação aos ADMINs. Usamos esse
  // canal como fallback para atualizar a página quando a publicação/RLS de
  // reward_redemptions não entregar o evento diretamente.
  usePostgresChanges<NotificationRow>({
    table: 'notifications',
    filter: `recipient_id=eq.${userId}`,
    event: 'INSERT',
    onUpsert: (notification) => {
      if (notification.type === 'REDEMPTION_REQUESTED') {
        router.refresh()
      }
    },
  })

  usePostgresChanges<Reward>({
    table: 'rewards',
    filter: `house_id=eq.${houseId}`,
    onUpsert: (row) =>
      setRewards((prev) => {
        const exists = prev.some((item) => item.id === row.id)
        return exists
          ? prev.map((item) => (item.id === row.id ? row : item))
          : [row, ...prev]
      }),
  })

  // Sugestões: nova sugestão (INSERT) e resolução (UPDATE) chegam ao vivo.
  usePostgresChanges<Tables<'reward_suggestions'>>({
    table: 'reward_suggestions',
    filter: `house_id=eq.${houseId}`,
    onUpsert: (row) =>
      setSuggestions((prev) => {
        const view: SuggestionView = {
          id: row.id,
          title: row.title,
          description: row.description,
          points_cost: row.points_cost,
          image_url: row.image_url,
          status: row.status,
          created_at: row.created_at,
          profileName: dependentNameById.get(row.profile_id) ?? 'Dependente',
        }
        const exists = prev.some((item) => item.id === row.id)
        return exists
          ? prev.map((item) => (item.id === row.id ? view : item))
          : [view, ...prev]
      }),
  })

  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    setFormError(null)
    const formData = new FormData(form)

    startTransition(async () => {
      const result = await createReward({
        title: String(formData.get('title') ?? ''),
        description: String(formData.get('description') ?? ''),
        pointsCost: Number(formData.get('points_cost')),
        emoji: String(formData.get('emoji') ?? ''),
        imageUrl: String(formData.get('image_url') ?? ''),
        dailyLimit: Number(formData.get('daily_limit') ?? 0) || 0,
        monthlyLimit: Number(formData.get('monthly_limit') ?? 0) || 0,
      })

      if (!result.ok) {
        setFormError(result.error)
        toast.error(result.error)
        return
      }

      toast.success('Recompensa criada!')
      form.reset()
      setShowRewardForm(false)
      setRewardEmoji(null)
      setRewardImageUrl(null)
      router.refresh()
    })
  }

  function handleSaveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingReward) return
    const form = event.currentTarget
    setFormError(null)
    const formData = new FormData(form)

    startTransition(async () => {
      const result = await updateReward(editingReward.id, {
        title: String(formData.get('title') ?? ''),
        description: String(formData.get('description') ?? ''),
        points_cost: Number(formData.get('points_cost')),
        emoji: String(formData.get('emoji') ?? ''),
        image_url: String(formData.get('image_url') ?? '') || null,
        daily_limit: Number(formData.get('daily_limit') ?? 0) || 0,
        monthly_limit: Number(formData.get('monthly_limit') ?? 0) || 0,
      })

      if (!result.ok) {
        setFormError(result.error)
        toast.error(result.error)
        return
      }

      toast.success('Recompensa atualizada!')
      setEditingReward(null)
      setEditImageUrl(null)
      router.refresh()
    })
  }

  function handleToggleActive(reward: Reward) {
    setFormError(null)
    startTransition(async () => {
      const result = await setRewardActive(reward.id, !reward.active)
      if (!result.ok) {
        setFormError(result.error)
        toast.error(result.error)
        return
      }
      toast.success(!reward.active ? 'Recompensa reativada!' : 'Recompensa desativada.')
      const nextActive = !reward.active
      setRewards((prev) =>
        prev.map((item) =>
          item.id === reward.id ? { ...item, active: nextActive } : item
        )
      )
      router.refresh()
    })
  }

  function handleResolve(redemption: RedemptionView, approve: boolean) {
    startTransition(async () => {
      const result = approve
        ? await approveRedemption(redemption.id)
        : await rejectRedemption(redemption.id)

      if (!result.ok) {
        setFormError(result.error)
        toast.error(result.error)
        return
      }

      if (approve) {
        toast.success('Resgate aprovado e pontos debitados!')
      } else {
        toast.info('Resgate rejeitado.')
      }

      const nextStatus = approve ? 'APPROVED' : 'REJECTED'
      const resolvedAt = new Date().toISOString()
      setRedemptions((prev) =>
        prev.map((item) =>
          item.id === redemption.id
            ? { ...item, status: nextStatus, resolved_at: resolvedAt }
            : item
        )
      )
      router.refresh()
    })
  }

  function handleResolveSuggestion(suggestion: SuggestionView, approve: boolean) {
    setFormError(null)
    startTransition(async () => {
      const result = await resolveRewardSuggestion(suggestion.id, approve)
      if (!result.ok) {
        setFormError(result.error)
        toast.error(result.error)
        return
      }

      if (approve) {
        toast.success('Sugestão aprovada e recompensa criada!')
      } else {
        toast.info('Sugestão rejeitada.')
      }

      const nextStatus = approve ? 'APPROVED' : 'REJECTED'
      setSuggestions((prev) =>
        prev.map((item) =>
          item.id === suggestion.id ? { ...item, status: nextStatus } : item
        )
      )
      router.refresh()
    })
  }

  function handlePreviewClick(rewardId: string) {
    catalogExpanded.expand('catalog')
    expand(rewardId)
    // Aguarda a renderização do catálogo expandido para rolar até o card.
    window.setTimeout(() => {
      const element = document.getElementById(`reward-${rewardId}`)
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 80)
  }

  const pendingRedemptions = redemptions.filter(
    (redemption) => redemption.status === 'PENDING'
  )
  const resolvedRedemptions = redemptions.filter(
    (redemption) => redemption.status !== 'PENDING'
  )
  const pendingSuggestions = suggestions.filter(
    (suggestion) => suggestion.status === 'PENDING'
  )
  const dismissedSuggestions = suggestions.filter(
    (suggestion) => suggestion.status !== 'PENDING'
  )

  const groupedRedemptions = useMemo(
    () => groupRedemptionsByStatus(resolvedRedemptions),
    [resolvedRedemptions]
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Nova recompensa</CardTitle>
                <CardDescription>
                  Item resgatável pelos dependentes da casa.
                </CardDescription>
              </div>
              <CardAction>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowRewardForm((value) => !value)}
                >
                  {showRewardForm ? 'Fechar' : 'Nova recompensa'}
                </Button>
              </CardAction>
            </CardHeader>
            {showRewardForm ? (
              <CardContent>
                <form onSubmit={handleCreate} className="grid gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="reward-title">Título</Label>
                    <ClearableInput
                      id="reward-title"
                      name="title"
                      required
                      placeholder="Ex.: 1h de videogame"
                      defaultValue=""
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-2">
                      <Label htmlFor="reward-cost">Custo em pontos</Label>
                      <Input
                        id="reward-cost"
                        name="points_cost"
                        type="number"
                        min={1}
                        step={1}
                        required
                        placeholder="Ex.: 50"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="reward-emoji">Emoji</Label>
                      <Input
                        id="reward-emoji"
                        name="emoji"
                        defaultValue={rewardEmoji ?? ''}
                        onChange={(event) => setRewardEmoji(event.target.value.trim().slice(0, 8) || null)}
                        placeholder="🎮"
                      />
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="reward-description">Descrição</Label>
                    <RichTextEditor
                      id="reward-description"
                      name="description"
                      rows={2}
                      limit={limits.rewardDescription}
                      placeholder="Opcional"
                      className="h-auto w-full min-w-0 rounded-xl border border-input bg-white px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="reward-daily-limit">
                        Limite diário de resgates
                      </Label>
                      <Input
                        id="reward-daily-limit"
                        name="daily_limit"
                        type="number"
                        min={0}
                        step={1}
                        placeholder="0 = ilimitado"
                      />
                      <p className="text-xs text-slate-500">
                        Quantos resgates o dependente pode fazer por dia. Em
                        branco ou 0 = ilimitado.
                      </p>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="reward-monthly-limit">
                        Limite mensal de resgates
                      </Label>
                      <Input
                        id="reward-monthly-limit"
                        name="monthly_limit"
                        type="number"
                        min={0}
                        step={1}
                        placeholder="0 = ilimitado"
                      />
                      <p className="text-xs text-slate-500">
                        Quantos resgates o dependente pode fazer por mês. Em
                        branco ou 0 = ilimitado.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label>Imagem (opcional)</Label>
                    <ImageUpload
                      folder="rewards"
                      ownerId={houseId}
                      value={rewardImageUrl}
                      onChange={setRewardImageUrl}
                    />
                    <input type="hidden" name="image_url" value={rewardImageUrl ?? ''} />
                  </div>

                  {formError ? (
                    <p className="text-sm text-destructive" role="alert">
                      {formError}
                    </p>
                  ) : null}

                  <Button type="submit" disabled={pending}>
                    {pending ? 'Criando...' : 'Criar recompensa'}
                  </Button>
                </form>
              </CardContent>
            ) : null}
          </Card>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <ClearableInput
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onClear={() => setSearch('')}
              placeholder="Buscar recompensa..."
              aria-label="Buscar recompensa"
              className="pl-10"
            />
          </div>
        </div>

        <Card>
          <CardHeader>
            <button
              type="button"
              onClick={() => catalogExpanded.toggle('catalog')}
              aria-expanded={catalogExpanded.isExpanded('catalog')}
              className="flex w-full items-center justify-between gap-2 text-left"
            >
              <CardTitle className="flex items-center gap-2">
                <Gift className="size-4 text-blue-600" />
                Catálogo
                <ChevronDown
                  className={cn(
                    'size-4 shrink-0 text-slate-400',
                    catalogExpanded.isHydrated && 'transition-transform duration-200',
                    catalogExpanded.isExpanded('catalog') && 'rotate-180'
                  )}
                />
              </CardTitle>
              <CardDescription>Recompensas disponíveis na casa.</CardDescription>
            </button>
          </CardHeader>
          {catalogExpanded.isExpanded('catalog') ? (
            <CardContent>
            {rewards.length === 0 ? (
              <EmptyState
                icon={Gift}
                accent="bg-amber-100 text-amber-600"
                title="Nenhuma recompensa criada ainda"
                message="Crie a primeira recompensa para os dependentes. 🎁"
              />
            ) : filteredRewards.length === 0 ? (
              <p
                className="rounded-xl bg-slate-100 px-3 py-6 text-center text-sm text-slate-500"
                role="status"
              >
                Nenhuma recompensa encontrada para &quot;{search.trim()}&quot;.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {filteredRewards.map((reward) => {
                  const limitLabel = rewardLimitLabel(
                    reward.daily_limit,
                    reward.monthly_limit
                  )
                  return (
                    <li
                      id={`reward-${reward.id}`}
                      key={reward.id}
                      className={cn(
                        'rounded-xl border border-slate-200/80 bg-white px-3 py-2 shadow-sm',
                        !reward.active && 'border-slate-300 bg-slate-50'
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        {reward.image_url ? (
                          <img
                            src={reward.image_url}
                            alt=""
                            className={cn(
                              'size-12 shrink-0 rounded-xl border border-slate-200 object-cover',
                              !reward.active && 'opacity-50 grayscale'
                            )}
                          />
                        ) : null}
                        <button
                          type="button"
                          onClick={() => toggle(reward.id)}
                          aria-expanded={isExpanded(reward.id)}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        >
                          <p className="font-medium text-slate-800">
                            {reward.emoji ? `${reward.emoji} ` : ''}
                            {reward.title}
                          </p>
                          <ChevronDown
                            className={cn(
                              'size-4 shrink-0 text-slate-400',
                              isHydrated && 'transition-transform duration-200',
                              isExpanded(reward.id) && 'rotate-180'
                            )}
                          />
                        </button>
                        <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-sm font-semibold text-amber-700">
                          {reward.points_cost} pts
                        </span>
                        {!reward.active ? (
                          <span className="shrink-0 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-medium text-rose-600">
                            Inativa
                          </span>
                        ) : null}
                      </div>
                      {isExpanded(reward.id) ? (
                        <div className="mt-2 flex flex-col gap-2 border-t border-slate-100 pt-2">
                          {reward.description ? (
                            <p className="whitespace-pre-wrap text-sm text-slate-500">
                              {parseRichText(reward.description)}
                            </p>
                          ) : null}
                          {limitLabel ? (
                            <span className="w-fit rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                              máx. {limitLabel}
                            </span>
                          ) : null}
                          <div className="flex shrink-0 flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="min-h-8 px-2 text-xs"
                              onClick={() => handleToggleActive(reward)}
                              disabled={pending}
                            >
                              {reward.active ? 'Desativar' : 'Reativar'}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="min-h-8 px-2 text-xs"
                              onClick={() => {
                                setFormError(null)
                                setEditImageUrl(reward.image_url)
                                setEditingReward(reward)
                              }}
                            >
                              Editar
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
          ) : (
            <CardContent>
              {rewards.length === 0 ? null : filteredRewards.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Nenhuma recompensa encontrada para &quot;{search.trim()}&quot;.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {filteredRewards.slice(0, 5).map((reward) => (
                    <button
                      type="button"
                      key={reward.id}
                      onClick={() => handlePreviewClick(reward.id)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100',
                        !reward.active && 'opacity-60'
                      )}
                    >
                      {reward.emoji ? `${reward.emoji} ` : null}
                      {reward.title}
                      <span className="text-amber-700">
                        {reward.points_cost} pts
                      </span>
                    </button>
                  ))}
                  {filteredRewards.length > 5 ? (
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
                      +{filteredRewards.length - 5}
                    </span>
                  ) : null}
                </div>
              )}
            </CardContent>
          )}
        </Card>
      </div>

      <section className="grid gap-3 xl:grid-cols-2 xl:items-start">
        <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-slate-800 xl:col-span-2">
          <Lightbulb className="size-4 text-violet-500" />
          Sugestões dos dependentes
        </h2>

        {pendingSuggestions.length === 0 ? (
          <EmptyState
            icon={Lightbulb}
            accent="bg-violet-100 text-violet-600"
            title="Nenhuma sugestão pendente"
            message="Dependentes sugerem recompensas para você aprovar ou recusar. 💡"
          />
        ) : (
          pendingSuggestions.map((suggestion) => (
            <Card
              key={suggestion.id}
              className="border-l-4 border-l-violet-400"
            >
              <CardContent className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  {suggestion.image_url ? (
                    <img
                      src={suggestion.image_url}
                      alt=""
                      className="mb-2 h-32 w-full rounded-xl border border-slate-200 object-cover"
                    />
                  ) : null}
                  <p className="font-semibold text-slate-800">
                    {suggestion.title}
                  </p>
                  {suggestion.description ? (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-500">
                      {parseRichText(suggestion.description)}
                    </p>
                  ) : null}
                  <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 font-semibold text-amber-700">
                      {suggestion.points_cost ?? '?'} pts sugeridos
                    </span>
                    <span>{suggestion.profileName}</span>
                    <span>
                      <FormattedDateTime iso={suggestion.created_at} />
                    </span>
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                  <Button
                    variant="outline"
                    onClick={() => handleResolveSuggestion(suggestion, false)}
                    disabled={pending}
                  >
                    Rejeitar
                  </Button>
                  <Button
                    onClick={() => handleResolveSuggestion(suggestion, true)}
                    disabled={pending}
                    className="bg-emerald-500 shadow-lg shadow-emerald-500/25 hover:bg-emerald-600"
                  >
                    Aprovar e criar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </section>

      {dismissedSuggestions.length > 0 ? (
        <section className="grid gap-3 xl:grid-cols-2 xl:items-start">
          <h2 className="font-heading text-sm font-semibold text-slate-500 xl:col-span-2">
            Sugestões resolvidas
          </h2>
          {dismissedSuggestions.map((suggestion) => (
            <Card
              key={suggestion.id}
              className={cn(
                'border-l-4',
                suggestion.status === 'APPROVED'
                  ? 'border-l-emerald-500'
                  : 'border-l-rose-400'
              )}
            >
              <CardContent className="flex items-center justify-between gap-2 py-2">
                <p className="text-sm font-medium text-slate-700">
                  {suggestion.title} ·{' '}
                  <span className="text-slate-500">{suggestion.profileName}</span>
                </p>
                <span
                  data-status={suggestion.status}
                  className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500 data-[status=APPROVED]:bg-emerald-50 data-[status=APPROVED]:text-emerald-700 data-[status=REJECTED]:bg-rose-100 data-[status=REJECTED]:text-rose-600"
                >
                  {suggestion.status === 'APPROVED' ? 'Aprovada' : 'Rejeitada'}
                </span>
              </CardContent>
            </Card>
          ))}
        </section>
      ) : null}

      <section className="grid gap-3 xl:grid-cols-2 xl:items-start">
        <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-slate-800 xl:col-span-2">
          <ClipboardList className="size-4 text-amber-500" />
          Solicitações de resgate
        </h2>

        {pendingRedemptions.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            accent="bg-amber-100 text-amber-600"
            title="Nenhuma solicitação pendente"
            message="Quando um dependente resgatar pontos, o pedido aparece aqui. 🎁"
          />
        ) : (
          pendingRedemptions.map((redemption) => (
            <Card
              key={redemption.id}
              className="border-l-4 border-l-amber-400"
            >
              <CardContent className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-slate-800">
                    {redemption.dependentName} quer {redemption.rewardTitle}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">
                      {redemption.points_cost} pts
                    </span>{' '}
                    ·{' '}
                    <FormattedDateTime iso={redemption.created_at} />
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                  <Button
                    variant="outline"
                    onClick={() => handleResolve(redemption, false)}
                    disabled={pending}
                  >
                    Rejeitar
                  </Button>
                  <Button
                    onClick={() => handleResolve(redemption, true)}
                    disabled={pending}
                    className="bg-emerald-500 shadow-lg shadow-emerald-500/25 hover:bg-emerald-600"
                  >
                    Aprovar e debitar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </section>

      {groupedRedemptions.length > 0 ? (
      <section className="grid gap-3 xl:grid-cols-2 xl:items-start">
        <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-slate-800 xl:col-span-2">
          <Layers className="size-4 text-slate-500" />
          Histórico
        </h2>
        {groupedRedemptions.map((redemption) => (
          <Card
            key={redemption.id}
            className={cn(
              'border-l-4',
              redemption.status === 'APPROVED'
                ? 'border-l-emerald-500'
                : 'border-l-rose-400'
            )}
          >
            <CardContent className="flex items-center justify-between gap-2 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  {redemption.dependentName} · {redemption.rewardTitle}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {redemption.points_cost} pts · tratado em{' '}
                  <FormattedDateTime iso={getRedemptionDisplayDate(redemption)} />
                </p>
              </div>
              <span
                data-status={redemption.status}
                className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium capitalize text-slate-500 data-[status=APPROVED]:bg-emerald-50 data-[status=APPROVED]:text-emerald-700 data-[status=REJECTED]:bg-rose-100 data-[status=REJECTED]:text-rose-600"
              >
                {redemption.status === 'APPROVED' ? 'Aprovado' : 'Rejeitado'}
                {redemption.totalCount > 1 && (
                  <span className="px-2.5 py-1 text-xs font-semibold">
                    {redemption.totalCount}x
                  </span>
                )}
              </span>
            </CardContent>
          </Card>
        ))}
      </section>
      ) : null}

      <Modal
        open={!!editingReward}
        onClose={() => {
          setEditingReward(null)
          setEditImageUrl(null)
        }}
        title={`Editar — ${editingReward?.title ?? ''}`}
      >
        {editingReward ? (
          <form onSubmit={handleSaveEdit} className="grid gap-3">
            <div className="grid gap-2">
              <Label htmlFor="edit-reward-title">Título</Label>
              <ClearableInput
                id="edit-reward-title"
                name="title"
                required
                defaultValue={editingReward.title}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="edit-reward-cost">Custo em pontos</Label>
                <Input
                  id="edit-reward-cost"
                  name="points_cost"
                  type="number"
                  min={1}
                  step={1}
                  required
                  defaultValue={editingReward.points_cost}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-reward-emoji">Emoji</Label>
                <Input
                  id="edit-reward-emoji"
                  name="emoji"
                  defaultValue={editingReward.emoji ?? ''}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-reward-description">Descrição</Label>
              <RichTextEditor
                id="edit-reward-description"
                name="description"
                rows={2}
                limit={limits.rewardDescription}
                defaultValue={editingReward.description ?? ''}
                className="h-auto w-full min-w-0 rounded-xl border border-input bg-white px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="edit-reward-daily-limit">
                  Limite diário de resgates
                </Label>
                <Input
                  id="edit-reward-daily-limit"
                  name="daily_limit"
                  type="number"
                  min={0}
                  step={1}
                  defaultValue={editingReward.daily_limit ?? 0}
                />
                <p className="text-xs text-slate-500">
                  Por dia. 0 = ilimitado.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-reward-monthly-limit">
                  Limite mensal de resgates
                </Label>
                <Input
                  id="edit-reward-monthly-limit"
                  name="monthly_limit"
                  type="number"
                  min={0}
                  step={1}
                  defaultValue={editingReward.monthly_limit ?? 0}
                />
                <p className="text-xs text-slate-500">
                  Por mês. 0 = ilimitado.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Imagem</Label>
              <ImageUpload
                folder="rewards"
                ownerId={houseId}
                value={editImageUrl}
                onChange={setEditImageUrl}
              />
              <input type="hidden" name="image_url" value={editImageUrl ?? ''} />
            </div>
            {formError ? (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            ) : null}
            <Button type="submit" disabled={pending}>
              {pending ? 'Salvando...' : 'Salvar alterações'}
            </Button>
          </form>
        ) : null}
      </Modal>
    </div>
  )
}
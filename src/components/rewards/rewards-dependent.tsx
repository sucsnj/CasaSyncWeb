'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Coins, Gift, Lightbulb, PartyPopper } from 'lucide-react'
import { createRewardSuggestion, requestRedemption } from '@/actions/rewards'
import { usePostgresChanges } from '@/hooks/use-postgres-changes'
import { useProfilePoints } from '@/hooks/use-profile-points'
import type { Tables } from '@/types/database'
import { ImageUpload } from '@/components/ui/image-upload'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type Reward = Tables<'rewards'>
type Redemption = Tables<'reward_redemptions'>

type RedemptionView = {
  id: string
  status: Redemption['status']
  points_cost: number
  created_at: string
  rewardTitle: string
}

type SuggestionView = {
  id: string
  title: string
  description: string | null
  points_cost: number | null
  status: Tables<'reward_suggestions'>['status']
  created_at: string
}

export function RewardsDependent({
  houseId,
  myId,
  initialPoints,
  initialRewards,
  initialRedemptions,
  initialSuggestions,
}: {
  houseId: string
  myId: string
  initialPoints: number
  initialRewards: Reward[]
  initialRedemptions: RedemptionView[]
  initialSuggestions: SuggestionView[]
}) {
  const router = useRouter()
  const [points, setPoints] = useState(initialPoints)
  const [rewards, setRewards] = useState<Reward[]>(initialRewards)
  const [redemptions, setRedemptions] = useState<RedemptionView[]>(
    initialRedemptions
  )
  const [suggestions, setSuggestions] = useState<SuggestionView[]>(
    initialSuggestions
  )
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showSuggestionModal, setShowSuggestionModal] = useState(false)
  const [suggestionImageUrl, setSuggestionImageUrl] = useState<string | null>(
    null
  )

  const rewardById = useMemo(
    () => new Map(rewards.map((reward) => [reward.id, reward])),
    [rewards]
  )

  // Saldo ao vivo: quando o ADMIN aprova uma tarefa ou um resgate, o
  // `profiles.points` muda e este listener atualiza o contador na hora.
  useProfilePoints(myId, setPoints)

  usePostgresChanges<Redemption>({
    table: 'reward_redemptions',
    filter: `house_id=eq.${houseId}`,
    onUpsert: (row) => {
      if (row.profile_id !== myId) return
      setRedemptions((prev) => {
        const view: RedemptionView = {
          id: row.id,
          status: row.status,
          points_cost: row.points_cost,
          created_at: row.created_at,
          rewardTitle: rewardById.get(row.reward_id)?.title ?? 'Recompensa',
        }
        const exists = prev.some((item) => item.id === row.id)
        return exists
          ? prev.map((item) => (item.id === row.id ? view : item))
          : [view, ...prev]
      })
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

  usePostgresChanges<Tables<'reward_suggestions'>>({
    table: 'reward_suggestions',
    filter: `house_id=eq.${houseId}`,
    onUpsert: (row) => {
      if (row.profile_id !== myId) return
      setSuggestions((prev) => {
        const view: SuggestionView = {
          id: row.id,
          title: row.title,
          description: row.description,
          points_cost: row.points_cost,
          status: row.status,
          created_at: row.created_at,
        }
        const exists = prev.some((item) => item.id === row.id)
        return exists
          ? prev.map((item) => (item.id === row.id ? view : item))
          : [view, ...prev]
      })
    },
  })

  function handleSuggest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    setError(null)
    const formData = new FormData(form)

    void (async () => {
      try {
        const result = await createRewardSuggestion({
          title: String(formData.get('title') ?? ''),
          description: String(formData.get('description') ?? ''),
          pointsCost: Number(formData.get('points_cost')) || null,
          imageUrl: String(formData.get('image_url') ?? '') || null,
        })
        if (!result.ok) {
          setError(result.error)
          return
        }
        form.reset()
        setShowSuggestionModal(false)
        setSuggestionImageUrl(null)
        router.refresh()
      } catch {
        setError('Falha de conexão. Tente novamente.')
      }
    })()
  }

  function handleRedeem(reward: Reward) {
    setError(null)
    setPendingId(reward.id)

    void (async () => {
      try {
        const result = await requestRedemption(reward.id)
        if (!result.ok) {
          setError(result.error)
          return
        }
        // O INSERT chega também via Realtime; refresh é a rede de segurança.
        router.refresh()
      } catch {
        setError('Falha de conexão. Tente novamente.')
      } finally {
        setPendingId(null)
      }
    })()
  }

  const myRedemptions = redemptions

  return (
    <div className="flex flex-col gap-6">
      <Card className="border-0 bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 text-white shadow-lg shadow-amber-500/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white/90">
            <Coins className="size-5" />
            Seu saldo
          </CardTitle>
          <CardDescription className="text-white/85">
            Pontos acumulados com tarefas aprovadas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="font-heading text-4xl font-bold tracking-tight text-white">
            {points} pts
          </p>
        </CardContent>
      </Card>

      {error ? (
        <p
          className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-slate-800">
            <Gift className="size-4 text-blue-600" />
            Loja de recompensas
          </h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setError(null)
              setShowSuggestionModal((value) => !value)
            }}
          >
            <Lightbulb className="size-3.5" />
            {showSuggestionModal ? 'Fechar' : 'Sugerir'}
          </Button>
        </div>

        {showSuggestionModal ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col gap-3 py-4">
              <form onSubmit={handleSuggest} className="grid gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="suggestion-title">Recompensa</Label>
                  <Input
                    id="suggestion-title"
                    name="title"
                    required
                    placeholder="Ex.: um passeio no parque"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="suggestion-cost">Quanto acha justo (pts)?</Label>
                  <Input
                    id="suggestion-cost"
                    name="points_cost"
                    type="number"
                    min={1}
                    step={1}
                    placeholder="Opcional"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="suggestion-description">Detalhes</Label>
                  <textarea
                    id="suggestion-description"
                    name="description"
                    rows={2}
                    placeholder="Opcional"
                    className="h-auto w-full min-w-0 resize-y rounded-xl border border-input bg-white px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Foto (opcional)</Label>
                  <ImageUpload
                    folder="suggestions"
                    ownerId={houseId}
                    value={suggestionImageUrl}
                    onChange={setSuggestionImageUrl}
                  />
                  <input
                    type="hidden"
                    name="image_url"
                    value={suggestionImageUrl ?? ''}
                  />
                </div>
                <Button type="submit" className="w-full">
                  Enviar sugestão
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : null}

        {rewards.length === 0 ? (
          <EmptyState
            icon={Gift}
            accent="bg-amber-100 text-amber-600"
            title="Loja vazia por enquanto"
            message="O administrador está preparando novidades para você. 🎁"
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {rewards.map((reward) => {
              const disabled =
                pendingId === reward.id || points < reward.points_cost
              return (
                <Card key={reward.id}>
                  <CardContent className="flex flex-col gap-2 py-3">
                    {reward.image_url ? (
                      <img
                        src={reward.image_url}
                        alt=""
                        className="h-32 w-full rounded-xl border border-slate-200 object-cover"
                      />
                    ) : null}
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-slate-800">
                        {reward.emoji ? `${reward.emoji} ` : ''}
                        {reward.title}
                      </p>
                      <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-sm font-semibold text-amber-700">
                        {reward.points_cost} pts
                      </span>
                    </div>
                    {reward.description ? (
                      <p className="text-sm text-slate-500">
                        {reward.description}
                      </p>
                    ) : null}
                    <div className="mt-1 flex items-center justify-between gap-2">
                      {points < reward.points_cost ? (
                        <span className="text-xs font-medium text-rose-600">
                          Saldo insuficiente
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">
                          Resgate enviado para aprovação
                        </span>
                      )}
                      <Button
                        size="sm"
                        onClick={() => handleRedeem(reward)}
                        disabled={disabled}
                        className="w-full sm:w-auto"
                      >
                        {pendingId === reward.id ? 'Resgatando...' : 'Resgatar'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </section>

      {suggestions.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-slate-800">
            <Lightbulb className="size-4 text-violet-500" />
            Suas sugestões
          </h2>
          {suggestions.map((suggestion) => (
            <Card
              key={suggestion.id}
              data-status={suggestion.status}
              className={cnStatusBorderSuggestion(suggestion.status)}
            >
              <CardContent className="flex items-center justify-between gap-2 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {suggestion.title}
                  </p>
                  {suggestion.points_cost !== null &&
                  suggestion.points_cost !== undefined ? (
                    <p className="text-xs text-slate-500">
                      {suggestion.points_cost} pts sugeridos
                    </p>
                  ) : null}
                </div>
                <span
                  data-status={suggestion.status}
                  className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium capitalize text-slate-500 data-[status=PENDING]:bg-amber-100 data-[status=PENDING]:text-amber-700 data-[status=APPROVED]:bg-emerald-50 data-[status=APPROVED]:text-emerald-700 data-[status=REJECTED]:bg-rose-100 data-[status=REJECTED]:text-rose-600"
                >
                  {suggestion.status === 'PENDING'
                    ? 'Aguardando aprovação'
                    : suggestion.status === 'APPROVED'
                      ? 'Aprovada 🎉'
                      : 'Rejeitada'}
                </span>
              </CardContent>
            </Card>
          ))}
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-slate-800">
          <PartyPopper className="size-4 text-amber-500" />
          Seus resgates
        </h2>

        {myRedemptions.length === 0 ? (
          <EmptyState
            icon={PartyPopper}
            accent="bg-violet-100 text-violet-600"
            title="Nenhum resgate solicitado ainda"
            message="Ao trocar seus pontos, o pedido aparece aqui. 🎁"
          />
        ) : (
          myRedemptions.map((redemption) => (
            <Card
              key={redemption.id}
              data-status={redemption.status}
              className={cnStatusBorder(redemption.status)}
            >
              <CardContent className="flex items-center justify-between gap-2 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {redemption.rewardTitle}
                  </p>
                  <p className="text-xs text-slate-500">
                    {redemption.points_cost} pts ·{' '}
                    {new Date(redemption.created_at).toLocaleString('pt-BR')}
                  </p>
                </div>
                <span
                  data-status={redemption.status}
                  className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium capitalize text-slate-500 data-[status=PENDING]:bg-amber-100 data-[status=PENDING]:text-amber-700 data-[status=APPROVED]:bg-emerald-50 data-[status=APPROVED]:text-emerald-700 data-[status=REJECTED]:bg-rose-100 data-[status=REJECTED]:text-rose-600"
                >
                  {redemption.status === 'PENDING'
                    ? 'Aguardando aprovação'
                    : redemption.status === 'APPROVED'
                      ? 'Aprovado'
                      : 'Rejeitado'}
                </span>
              </CardContent>
            </Card>
          ))
        )}
      </section>
    </div>
  )
}

function cnStatusBorder(status: Redemption['status']) {
  return status === 'APPROVED'
    ? 'border-l-4 border-l-emerald-500'
    : status === 'REJECTED'
      ? 'border-l-4 border-l-rose-400'
      : 'border-l-4 border-l-amber-400'
}

function cnStatusBorderSuggestion(status: Tables<'reward_suggestions'>['status']) {
  return status === 'APPROVED'
    ? 'border-l-4 border-l-emerald-500'
    : status === 'REJECTED'
      ? 'border-l-4 border-l-rose-400'
      : 'border-l-4 border-l-amber-400'
}
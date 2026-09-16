'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Coins, Gift, PartyPopper } from 'lucide-react'
import { requestRedemption } from '@/actions/rewards'
import { usePostgresChanges } from '@/hooks/use-postgres-changes'
import { useProfilePoints } from '@/hooks/use-profile-points'
import type { Tables } from '@/types/database'
import { Button } from '@/components/ui/button'
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

export function RewardsDependent({
  houseId,
  myId,
  initialPoints,
  initialRewards,
  initialRedemptions,
}: {
  houseId: string
  myId: string
  initialPoints: number
  initialRewards: Reward[]
  initialRedemptions: RedemptionView[]
}) {
  const router = useRouter()
  const [points, setPoints] = useState(initialPoints)
  const [rewards, setRewards] = useState<Reward[]>(initialRewards)
  const [redemptions, setRedemptions] = useState<RedemptionView[]>(
    initialRedemptions
  )
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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
      <Card className="border-0 bg-gradient-to-br from-blue-600 to-sky-500 text-white shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white/90">
            <Coins className="size-5" />
            Seu saldo
          </CardTitle>
          <CardDescription className="text-white/80">
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
        <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-slate-800">
          <Gift className="size-4 text-blue-600" />
          Loja de recompensas
        </h2>

        {rewards.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nenhuma recompensa disponível por enquanto.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {rewards.map((reward) => {
              const disabled =
                pendingId === reward.id || points < reward.points_cost
              return (
                <Card key={reward.id}>
                  <CardContent className="flex flex-col gap-2 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-slate-800">
                        {reward.emoji ? `${reward.emoji} ` : ''}
                        {reward.title}
                      </p>
                      <span className="shrink-0 rounded-full bg-sky-100 px-2.5 py-1 text-sm font-semibold text-sky-700">
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

      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-slate-800">
          <PartyPopper className="size-4 text-amber-500" />
          Seus resgates
        </h2>

        {myRedemptions.length === 0 ? (
          <p className="text-sm text-slate-500">
            Você ainda não solicitou nenhum resgate.
          </p>
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
                  className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium capitalize text-slate-500 data-[status=PENDING]:bg-amber-100 data-[status=PENDING]:text-amber-700 data-[status=APPROVED]:bg-emerald-100 data-[status=APPROVED]:text-emerald-700 data-[status=REJECTED]:bg-rose-100 data-[status=REJECTED]:text-rose-600"
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
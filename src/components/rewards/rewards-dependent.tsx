'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
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
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Seu saldo</CardTitle>
          <CardDescription>Pontos acumulados com tarefas aprovadas.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="font-heading text-3xl font-semibold">{points} pts</p>
        </CardContent>
      </Card>

      {error ? (
        <p
          className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-base font-medium">Loja de recompensas</h2>

        {rewards.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma recompensa disponível por enquanto.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {rewards.map((reward) => {
              const disabled = pendingId === reward.id || points < reward.points_cost
              return (
                <Card key={reward.id}>
                  <CardContent className="flex flex-col gap-2">
                    <p className="font-medium">{reward.title}</p>
                    {reward.description ? (
                      <p className="text-sm text-muted-foreground">
                        {reward.description}
                      </p>
                    ) : null}
                    <div className="flex items-center justify-between">
                      <span className="text-sm">{reward.points_cost} pts</span>
                      <Button
                        size="sm"
                        onClick={() => handleRedeem(reward)}
                        disabled={disabled}
                      >
                        {pendingId === reward.id ? 'Resgatando...' : 'Resgatar'}
                      </Button>
                    </div>
                    {points < reward.points_cost ? (
                      <p className="text-xs text-muted-foreground">
                        Saldo insuficiente
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-base font-medium">Seus resgates</h2>

        {myRedemptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Você ainda não solicitou nenhum resgate.
          </p>
        ) : (
          myRedemptions.map((redemption) => (
            <Card key={redemption.id}>
              <CardContent className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{redemption.rewardTitle}</p>
                  <p className="text-xs text-muted-foreground">
                    {redemption.points_cost} pts ·{' '}
                    {new Date(redemption.created_at).toLocaleString('pt-BR')}
                  </p>
                </div>
                <span
                  data-status={redemption.status}
                  className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium capitalize text-muted-foreground data-[status=PENDING]:bg-amber-100 data-[status=PENDING]:text-amber-700 data-[status=APPROVED]:bg-emerald-100 data-[status=APPROVED]:text-emerald-700 data-[status=REJECTED]:bg-destructive/10 data-[status=REJECTED]:text-destructive"
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
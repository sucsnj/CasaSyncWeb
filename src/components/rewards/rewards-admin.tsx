'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { approveRedemption, createReward, rejectRedemption } from '@/actions/rewards'
import { usePostgresChanges } from '@/hooks/use-postgres-changes'
import type { Tables } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  dependentName: string
}

export function RewardsAdmin({
  houseId,
  initialRewards,
  initialRedemptions,
  dependents,
}: {
  houseId: string
  initialRewards: Reward[]
  initialRedemptions: RedemptionView[]
  dependents: { id: string; full_name: string }[]
}) {
  const router = useRouter()
  const [rewards, setRewards] = useState<Reward[]>(initialRewards)
  const [redemptions, setRedemptions] = useState<RedemptionView[]>(
    initialRedemptions
  )
  const [pending, startTransition] = useTransition()
  const [formError, setFormError] = useState<string | null>(null)

  const rewardById = useMemo(
    () => new Map(rewards.map((reward) => [reward.id, reward])),
    [rewards]
  )
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
      rewardTitle: rewardById.get(row.reward_id)?.title ?? 'Recompensa',
      dependentName: dependentNameById.get(row.profile_id) ?? 'Dependente',
    }
  }

  // Realtime: nova solicitação do dependente (INSERT) e resolução concorrente
  // (UPDATE) aparecem na hora. Filtro por casa + RLS = isolamento multi-tenant.
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

  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    // currentTarget é nulled após o primeiro await — capturar o form agora.
    const form = event.currentTarget

    setFormError(null)
    const formData = new FormData(form)

    startTransition(async () => {
      const result = await createReward({
        title: String(formData.get('title') ?? ''),
        description: String(formData.get('description') ?? ''),
        pointsCost: Number(formData.get('points_cost')),
      })

      if (!result.ok) {
        setFormError(result.error)
        return
      }

      form.reset()
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
        return
      }

      const nextStatus = approve ? 'APPROVED' : 'REJECTED'
      setRedemptions((prev) =>
        prev.map((item) =>
          item.id === redemption.id
            ? { ...item, status: nextStatus }
            : item
        )
      )
      router.refresh()
    })
  }

  const pendingRedemptions = redemptions.filter(
    (redemption) => redemption.status === 'PENDING'
  )
  const resolvedRedemptions = redemptions.filter(
    (redemption) => redemption.status !== 'PENDING'
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Nova recompensa</CardTitle>
            <CardDescription>
              Item resgatável pelos dependentes da casa.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="grid gap-3">
              <div className="grid gap-2">
                <Label htmlFor="reward-title">Título</Label>
                <Input
                  id="reward-title"
                  name="title"
                  required
                  placeholder="Ex.: 1h de videogame"
                />
              </div>

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
                <Label htmlFor="reward-description">Descrição</Label>
                <textarea
                  id="reward-description"
                  name="description"
                  rows={2}
                  placeholder="Opcional"
                  className="h-auto w-full min-w-0 resize-y rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
                />
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
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Catálogo</CardTitle>
            <CardDescription>Recompensas disponíveis na casa.</CardDescription>
          </CardHeader>
          <CardContent>
            {rewards.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma recompensa criada ainda.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {rewards.map((reward) => (
                  <li
                    key={reward.id}
                    className="flex items-center justify-between rounded-lg border border-input px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium">{reward.title}</p>
                      {reward.description ? (
                        <p className="text-sm text-muted-foreground">
                          {reward.description}
                        </p>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-sm">{reward.points_cost} pts</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-base font-medium">
          Solicitações de resgate
        </h2>

        {pendingRedemptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma solicitação pendente.
          </p>
        ) : (
          pendingRedemptions.map((redemption) => (
            <Card key={redemption.id}>
              <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">
                    {redemption.dependentName} quer {redemption.rewardTitle}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {redemption.points_cost} pts ·{' '}
                    {new Date(redemption.created_at).toLocaleString('pt-BR')}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
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
                  >
                    Aprovar e debitar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </section>

      {resolvedRedemptions.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-base font-medium">Histórico</h2>
          {resolvedRedemptions.map((redemption) => (
            <Card key={redemption.id}>
              <CardContent className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">
                    {redemption.dependentName} · {redemption.rewardTitle}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {redemption.points_cost} pts · tratado em{' '}
                    {new Date(redemption.created_at).toLocaleString('pt-BR')}
                  </p>
                </div>
                <span
                  data-status={redemption.status}
                  className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium capitalize text-muted-foreground data-[status=APPROVED]:bg-emerald-100 data-[status=APPROVED]:text-emerald-700 data-[status=REJECTED]:bg-destructive/10 data-[status=REJECTED]:text-destructive"
                >
                  {redemption.status === 'APPROVED' ? 'Aprovado' : 'Rejeitado'}
                </span>
              </CardContent>
            </Card>
          ))}
        </section>
      ) : null}
    </div>
  )
}
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/utils/supabase/admin'
import {
  getActiveAdminHouse,
  getDependentHouse,
  getSessionProfile,
} from '@/utils/house'
import { getMyNotifications } from '@/utils/notifications'
import { DashboardNav, type NavItem } from '@/components/dashboard/dashboard-nav'
import { RewardsAdmin } from '@/components/rewards/rewards-admin'
import { RewardsDependent } from '@/components/rewards/rewards-dependent'
import type { Tables } from '@/types/database'

export const metadata: Metadata = {
  title: 'Recompensas',
}

export const dynamic = 'force-dynamic'

const adminItems: NavItem[] = [
  { href: '/dashboard/admin', label: 'Visão geral' },
  { href: '/dashboard/admin/houses', label: 'Casas' },
  { href: '/tasks', label: 'Tarefas' },
  { href: '/rewards', label: 'Recompensas' },
]

const dependentItems: NavItem[] = [
  { href: '/dashboard/dependent', label: 'Visão geral' },
  { href: '/tasks', label: 'Tarefas' },
  { href: '/rewards', label: 'Recompensas' },
]

type Redemption = Tables<'reward_redemptions'>

export default async function RewardsPage() {
  const { user, profile } = await getSessionProfile()

  if (!user || !profile) {
    redirect('/login')
  }

  // Service-role: a visibilidade é decidida pela posse/co-controle da casa
  // (sessão), não por policies RLS — o co-gerente precisa ver a loja/resgates
  // da casa mesmo não sendo o `owner_id`.
  const admin = createAdminClient()
  const isAdmin = profile.user_role === 'ADMIN'

  // Notificações e a casa (ativa p/ ADMIN, do dependente) em paralelo. A
  // sessão é reutilizada entre as chamadas via `React.cache` em `utils/house.ts`.
  const [notifications, activeHouse, dependentHouse] = await Promise.all([
    getMyNotifications(user.id),
    isAdmin ? getActiveAdminHouse() : Promise.resolve(null),
    isAdmin ? Promise.resolve(null) : getDependentHouse(user.id),
  ])

  let content: React.ReactNode

  if (isAdmin) {
    if (!activeHouse) {
      content = (
        <p className="text-sm text-muted-foreground">
          Crie ou selecione uma casa em{' '}
          <a href="/dashboard/admin/houses" className="text-primary underline">
            Casas
          </a>{' '}
          para gerenciar recompensas.
        </p>
      )
    } else {
      const [{ data: rewards }, { data: redemptions }, { data: members }, { data: suggestions }] =
        await Promise.all([
          admin
            .from('rewards')
            .select('*')
            .eq('house_id', activeHouse.id)
            .order('created_at', { ascending: true }),
          admin
            .from('reward_redemptions')
            .select('*')
            .eq('house_id', activeHouse.id)
            .order('created_at', { ascending: true }),
          admin
            .from('house_members')
            .select('profile_id')
            .eq('house_id', activeHouse.id)
            .eq('role', 'DEPENDENT'),
          admin
            .from('reward_suggestions')
            .select('*')
            .eq('house_id', activeHouse.id)
            .order('created_at', { ascending: false }),
        ])

      const profileIds = members?.map((member) => member.profile_id) ?? []
      const nameById = new Map<string, string>()
      if (profileIds.length > 0) {
        const { data: profiles } = await admin
          .from('profiles')
          .select('id, full_name')
          .in('id', profileIds)
        ;(profiles ?? []).forEach((p) =>
          nameById.set(p.id, p.full_name ?? 'Sem nome')
        )
      }

      const rewardTitleById = new Map(
        (rewards ?? []).map((reward) => [reward.id, reward.title])
      )

      const redemptionViews = (redemptions ?? []).map(
        (redemption: Redemption) => ({
          id: redemption.id,
          status: redemption.status,
          points_cost: redemption.points_cost,
          created_at: redemption.created_at,
          rewardTitle: rewardTitleById.get(redemption.reward_id) ?? 'Recompensa',
          dependentName: nameById.get(redemption.profile_id) ?? 'Dependente',
        })
      )

      const suggestionViews = (suggestions ?? []).map((suggestion) => ({
        id: suggestion.id,
        title: suggestion.title,
        description: suggestion.description,
        points_cost: suggestion.points_cost,
        image_url: suggestion.image_url,
        status: suggestion.status,
        created_at: suggestion.created_at,
        profileName: nameById.get(suggestion.profile_id) ?? 'Dependente',
      }))

      content = (
        <RewardsAdmin
          key={`${activeHouse.id}:${(redemptions ?? [])
            .map((redemption) => `${redemption.id}-${redemption.status}`)
            .join(',')}`}
          houseId={activeHouse.id}
          userId={user.id}
          initialRewards={rewards ?? []}
          initialRedemptions={redemptionViews}
          initialSuggestions={suggestionViews}
          dependents={Array.from(nameById, ([id, full_name]) => ({
            id,
            full_name,
          }))}
        />
      )
    }
  } else {
    if (!dependentHouse) {
      content = (
        <p className="text-sm text-muted-foreground">
          Você ainda não foi vinculado a uma casa.
        </p>
      )
    } else {
      const [{ data: rewards }, { data: redemptions }, { data: suggestions }] =
        await Promise.all([
          admin
            .from('rewards')
            .select('*')
            .eq('house_id', dependentHouse.id)
            .order('created_at', { ascending: true }),
          admin
            .from('reward_redemptions')
            .select('*')
            .eq('house_id', dependentHouse.id)
            .eq('profile_id', user.id)
            .order('created_at', { ascending: true }),
          admin
            .from('reward_suggestions')
            .select('*')
            .eq('house_id', dependentHouse.id)
            .eq('profile_id', user.id)
            .order('created_at', { ascending: false }),
        ])

      const rewardTitleById = new Map(
        (rewards ?? []).map((reward) => [reward.id, reward.title])
      )

      const redemptionViews = (redemptions ?? []).map(
        (redemption: Redemption) => ({
          id: redemption.id,
          status: redemption.status,
          points_cost: redemption.points_cost,
          created_at: redemption.created_at,
          rewardTitle: rewardTitleById.get(redemption.reward_id) ?? 'Recompensa',
        })
      )

      content = (
        <RewardsDependent
          key={dependentHouse.id}
          houseId={dependentHouse.id}
          myId={user.id}
          initialPoints={profile.points}
          initialRewards={rewards ?? []}
          initialRedemptions={redemptionViews}
          initialSuggestions={(suggestions ?? []).map((suggestion) => ({
            id: suggestion.id,
            title: suggestion.title,
            description: suggestion.description,
            points_cost: suggestion.points_cost,
            status: suggestion.status,
            created_at: suggestion.created_at,
          }))}
        />
      )
    }
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-5xl flex-col gap-6 p-4 pt-20 pb-24 md:p-6 md:pt-24 md:pb-6">
      <DashboardNav
        items={isAdmin ? adminItems : dependentItems}
        userName={profile.full_name}
        points={isAdmin ? undefined : profile.points}
        userId={user.id}
        notifications={notifications}
        role={isAdmin ? 'ADMIN' : 'DEPENDENT'}
      />
      <main className="flex flex-col gap-6">{content}</main>
    </div>
  )
}
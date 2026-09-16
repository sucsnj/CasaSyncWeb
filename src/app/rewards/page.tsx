import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import {
  getActiveAdminHouse,
  getDependentHouse,
  getSessionProfile,
} from '@/utils/house'
import { DashboardNav, type NavItem } from '@/components/dashboard/dashboard-nav'
import { RewardsAdmin } from '@/components/rewards/rewards-admin'
import { RewardsDependent } from '@/components/rewards/rewards-dependent'
import type { Tables } from '@/types/database'

export const metadata: Metadata = {
  title: 'Recompensas | CasaSync',
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

  const supabase = await createClient()
  const isAdmin = profile.user_role === 'ADMIN'

  let content: React.ReactNode

  if (isAdmin) {
    const activeHouse = await getActiveAdminHouse()
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
          supabase
            .from('rewards')
            .select('*')
            .eq('house_id', activeHouse.id)
            .order('created_at', { ascending: true }),
          supabase
            .from('reward_redemptions')
            .select('*')
            .eq('house_id', activeHouse.id)
            .order('created_at', { ascending: true }),
          supabase
            .from('house_members')
            .select('profile_id')
            .eq('house_id', activeHouse.id)
            .eq('role', 'DEPENDENT'),
          supabase
            .from('reward_suggestions')
            .select('*')
            .eq('house_id', activeHouse.id)
            .order('created_at', { ascending: false }),
        ])

      const profileIds = members?.map((member) => member.profile_id) ?? []
      const nameById = new Map<string, string>()
      if (profileIds.length > 0) {
        const { data: profiles } = await supabase
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
          key={activeHouse.id}
          houseId={activeHouse.id}
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
    const house = await getDependentHouse(user.id)
    if (!house) {
      content = (
        <p className="text-sm text-muted-foreground">
          Você ainda não foi vinculado a uma casa.
        </p>
      )
    } else {
      const [{ data: rewards }, { data: redemptions }, { data: suggestions }] =
        await Promise.all([
          supabase
            .from('rewards')
            .select('*')
            .eq('house_id', house.id)
            .order('created_at', { ascending: true }),
          supabase
            .from('reward_redemptions')
            .select('*')
            .eq('house_id', house.id)
            .eq('profile_id', user.id)
            .order('created_at', { ascending: true }),
          supabase
            .from('reward_suggestions')
            .select('*')
            .eq('house_id', house.id)
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
          key={house.id}
          houseId={house.id}
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
        points={profile.points}
      />
      <main className="flex flex-col gap-6">{content}</main>
    </div>
  )
}
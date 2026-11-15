import type { Metadata } from 'next'
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { redirect } from 'next/navigation'
import { fetchRewardsForCache } from '@/actions/rewards'
import { queryKeys } from '@/lib/query-keys'
import { unwrapAction } from '@/lib/unwrap-action'
import { getCachedHouseMembers } from '@/utils/data-cache'
import {
  getActiveAdminHouse,
  getDependentHouse,
  getSessionProfile,
} from '@/utils/house'
import { getHouseTextLimitsSettings, getHouseTimezoneSettings } from '@/utils/house-settings'
import { zonedDayStart, zonedMonthStart } from '@/utils/timezone'
import { RewardsAdmin } from '@/components/rewards/rewards-admin'
import { RewardsDependent } from '@/components/rewards/rewards-dependent'

export const metadata: Metadata = {
  title: 'Recompensas',
}

export default async function RewardsPage() {
  const { user, profile } = await getSessionProfile()

  if (!user || !profile) {
    redirect('/login')
  }

  // Visibilidade por posse/co-controle da casa (sessão), não por policies RLS.
  const isAdmin = profile.user_role === 'ADMIN'

  // A casa que dá contexto à tela (ativa p/ ADMIN, do dependente). O shell
  // (nav, sino, castigo, comunicados) vive no `layout.tsx` do grupo `(app)`.
  // A sessão é reutilizada entre as chamadas via `React.cache` em `utils/house.ts`.
  const [activeHouse, dependentHouse] = await Promise.all([
    isAdmin ? getActiveAdminHouse() : Promise.resolve(null),
    isAdmin ? Promise.resolve(null) : getDependentHouse(user.id),
  ])

  // Teto de caracteres da descrição (chave `text_limits). Admin no formulário da
  // recompensa, dependente no da sugestão — que vira recompensa na aprovação.
  const houseIdForSettings = isAdmin ? activeHouse?.id : dependentHouse?.id
  const textLimitsSettings = houseIdForSettings
    ? await getHouseTextLimitsSettings(houseIdForSettings)
    : undefined

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
      // UMA leitura para a tela inteira (a action devolve catálogo, resgates e
      // sugestões): o mesmo resultado vira prop e o estado do cache — zero
      // requisição duplicada no primeiro paint.
      const queryClient = new QueryClient()
      const data = await queryClient.fetchQuery({
        queryKey: queryKeys.rewards.screen(activeHouse.id),
        queryFn: () => unwrapAction(fetchRewardsForCache),
      })
      const { rewards, redemptions, suggestions } = data

      // Dependentes da casa: nome para os cards (mesmo diretório cacheado).
      const { members, nameById } = await getCachedHouseMembers(activeHouse.id)
      const dependents = members
        .filter((member) => member.role === 'DEPENDENT')
        .map((member) => ({
          id: member.profileId,
          full_name: nameById[member.profileId] ?? 'Sem nome',
        }))

      const dehydratedState = dehydrate(queryClient)

      content = (
        <HydrationBoundary state={dehydratedState}>
          <RewardsAdmin
            key={activeHouse.id}
            houseId={activeHouse.id}
            userId={user.id}
            initialRewards={rewards}
            initialRedemptions={redemptions}
            initialSuggestions={suggestions}
            dependents={dependents}
            textLimits={textLimitsSettings}
          />
        </HydrationBoundary>
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
      // Mesma leitura única do ADMIN (a action resolve o papel).
      const queryClient = new QueryClient()
      const data = await queryClient.fetchQuery({
        queryKey: queryKeys.rewards.screen(dependentHouse.id),
        queryFn: () => unwrapAction(fetchRewardsForCache),
      })
      const { rewards, redemptions, suggestions } = data

      // Fronteiras das janelas do limitador de resgate (dia/mês corrente no fuso
      // da CASA) — calculadas no servidor para o client só comparar instantes.
      const { timezone } = await getHouseTimezoneSettings(dependentHouse.id)
      const now = new Date()
      const dayStartIso = zonedDayStart(timezone, now).toISOString()
      const monthStartIso = zonedMonthStart(timezone, now).toISOString()

      const dehydratedState = dehydrate(queryClient)
      content = (
        <HydrationBoundary state={dehydratedState}>
          <RewardsDependent
            key={dependentHouse.id}
            houseId={dependentHouse.id}
            myId={user.id}
            initialPoints={profile.points}
            initialRewards={rewards}
            initialRedemptions={redemptions}
            dayStartIso={dayStartIso}
            monthStartIso={monthStartIso}
            initialSuggestions={suggestions}
            textLimits={textLimitsSettings}
          />
        </HydrationBoundary>
      )
    }
  }

  return <main className="flex flex-col gap-6">{content}</main>
}
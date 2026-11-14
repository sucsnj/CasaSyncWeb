import type { Metadata } from 'next'
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { redirect } from 'next/navigation'
import { fetchAchievementsForCache } from '@/actions/achievements'
import { queryKeys } from '@/lib/query-keys'
import { unwrapAction } from '@/lib/unwrap-action'
import Link from 'next/link'
import {
  getActiveAdminHouse,
  getDependentHouse,
  getHouseAssignees,
  getSessionProfile,
} from '@/utils/house'
import { getHouseTextLimitsSettings } from '@/utils/house-settings'
import { AchievementsAdmin } from '@/components/achievements/achievements-admin'
import { AchievementsDependent } from '@/components/achievements/achievements-dependent'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export const metadata: Metadata = {
  title: 'Conquistas',
}

export const dynamic = 'force-dynamic'

function NoHouseCard({ role }: { role: 'ADMIN' | 'DEPENDENT' }) {
  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>Nenhuma casa ativa</CardTitle>
        <CardDescription>
          {role === 'ADMIN'
            ? 'Crie ou selecione uma casa antes de gerenciar conquistas.'
            : 'Você ainda não foi vinculado a uma casa.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {role === 'ADMIN' ? (
          <Link
            href="/dashboard/admin/houses"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Gerenciar casas →
          </Link>
        ) : null}
      </CardContent>
    </Card>
  )
}

export default async function AchievementsPage() {
  const { user, profile } = await getSessionProfile()

  if (!user || !profile) {
    redirect('/login')
  }

  const isAdmin = profile.user_role === 'ADMIN'

  // A casa que dá contexto à tela (ativa p/ ADMIN, do dependente). O shell
  // (nav, sino, castigo, comunicados) vive no `layout.tsx` do grupo `(app)`.
  const [activeHouse, dependentHouse] = await Promise.all([
    isAdmin ? getActiveAdminHouse() : Promise.resolve(null),
    isAdmin ? Promise.resolve(null) : getDependentHouse(user.id),
  ])

  // Teto de caracteres da descrição da conquista (chave `text_limits) — só o
  // ADMIN escreve descrição, então a leitura é da casa ativa dele.
  const textLimitsSettings = isAdmin && activeHouse
    ? await getHouseTextLimitsSettings(activeHouse.id)
    : undefined

  let content: React.ReactNode

  if (isAdmin) {
    if (!activeHouse) {
      content = <NoHouseCard role="ADMIN" />
    } else {
      // UMA leitura para a tela inteira: o mesmo resultado vira prop e o estado
      // do cache — zero requisição duplicada no primeiro paint.
      const queryClient = new QueryClient()
      const data = await queryClient.fetchQuery({
        queryKey: queryKeys.achievements.screen(activeHouse.id, user.id),
        queryFn: () => unwrapAction(fetchAchievementsForCache),
      })

      const dependents = await getHouseAssignees(activeHouse.id)
      const dehydratedState = dehydrate(queryClient)

      content = (
        <HydrationBoundary state={dehydratedState}>
          <AchievementsAdmin
            key={activeHouse.id}
            houseId={activeHouse.id}
            userId={user.id}
            initialAchievements={data.achievements}
            dependents={dependents}
            initialProgress={data.progress}
            textLimits={textLimitsSettings}
          />
        </HydrationBoundary>
      )
    }


  } else {
    if (!dependentHouse) {
      content = <NoHouseCard role="DEPENDENT" />
    } else {
      // Mesma leitura única do ADMIN (a action resolve o papel).
      const queryClient = new QueryClient()
      const data = await queryClient.fetchQuery({
        queryKey: queryKeys.achievements.screen(dependentHouse.id, user.id),
        queryFn: () => unwrapAction(fetchAchievementsForCache),
      })

      const dehydratedState = dehydrate(queryClient)

      content = (
        <HydrationBoundary state={dehydratedState}>
          <AchievementsDependent
            key={dependentHouse.id}
            houseId={dependentHouse.id}
            userId={user.id}
            initialAchievements={data.achievements}
            initialProgress={data.progress}
          />
        </HydrationBoundary>
      )

    }
  }

  return <main className="flex flex-col gap-6">{content}</main>
}
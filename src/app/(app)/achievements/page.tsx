import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  getActiveAdminHouse,
  getDependentHouse,
  getSessionProfile,
} from '@/utils/house'
import { getHouseTextLimitsSettings } from '@/utils/house-settings'
import { listAchievements } from '@/actions/achievements-reads'
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
      // Bundle via service role, com escopo derivado da sessão (ADR-0006) —
      // o mesmo payload do query cache.
      const bundle = await listAchievements(activeHouse.id)
      if (bundle.role !== 'ADMIN') throw new Error('ROLE_MISMATCH')
      const initialData = bundle

      content = (
        <AchievementsAdmin
          key={activeHouse.id}
          houseId={activeHouse.id}
          initialData={initialData}
          textLimits={textLimitsSettings}
        />
      )
    }
  } else {
    if (!dependentHouse) {
      content = <NoHouseCard role="DEPENDENT" />
    } else {
      const bundle = await listAchievements(dependentHouse.id)
      if (bundle.role !== 'DEPENDENT') throw new Error('ROLE_MISMATCH')
      const initialData = bundle

      content = (
        <AchievementsDependent
          key={dependentHouse.id}
          houseId={dependentHouse.id}
          initialData={initialData}
        />
      )
    }
  }

  return <main className="flex flex-col gap-6">{content}</main>
}
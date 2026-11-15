import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import {
  getActiveAdminHouse,
  getDependentHouse,
  getSessionProfile,
} from '@/utils/house'
import { getHouseTextLimitsSettings, getHouseTimezoneSettings } from '@/utils/house-settings'
import { zonedDayStart, zonedMonthStart } from '@/utils/timezone'
import { listRewards } from '@/actions/rewards-reads'
import { RewardsAdmin } from '@/components/rewards/rewards-admin'
import { RewardsDependent } from '@/components/rewards/rewards-dependent'

export const metadata: Metadata = {
  title: 'Recompensas',
}

export const dynamic = 'force-dynamic'

export default async function RewardsPage() {
  const { user, profile } = await getSessionProfile()

  if (!user || !profile) {
    redirect('/login')
  }

  // Service-role: a visibilidade é decidida pela posse/co-controle da casa
  // (sessão), não por policies RLS — o co-gerente precisa ver a loja/resgates
  // da casa mesmo não sendo o `owner_id`. As leituras passam pela action
  // `listRewards`, que deriva o escopo da sessão e monta o bundle (catálogo +
  // resgates + sugestões + dependentes) — o mesmo payload do query cache.
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
      const bundle = await listRewards(activeHouse.id)
      if (bundle.role !== 'ADMIN') throw new Error('ROLE_MISMATCH')
      const initialData = bundle

      content = (
        <RewardsAdmin
          key={activeHouse.id}
          houseId={activeHouse.id}
          userId={user.id}
          initialData={initialData}
          textLimits={textLimitsSettings}
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
      const bundle = await listRewards(dependentHouse.id)
      if (bundle.role !== 'DEPENDENT') throw new Error('ROLE_MISMATCH')
      const initialData = bundle

      // Fronteiras das janelas do limitador de resgate (dia/mês corrente no fuso
      // da CASA) — calculadas no servidor para o client só comparar instantes.
      const { timezone } = await getHouseTimezoneSettings(dependentHouse.id)
      const now = new Date()
      const dayStartIso = zonedDayStart(timezone, now).toISOString()
      const monthStartIso = zonedMonthStart(timezone, now).toISOString()

      content = (
        <RewardsDependent
          key={dependentHouse.id}
          houseId={dependentHouse.id}
          myId={user.id}
          initialPoints={profile.points}
          initialData={initialData}
          dayStartIso={dayStartIso}
          monthStartIso={monthStartIso}
          textLimits={textLimitsSettings}
        />
      )
    }
  }

  return <main className="flex flex-col gap-6">{content}</main>
}
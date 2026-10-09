import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { after } from 'next/server'
import Link from 'next/link'
import { createAdminClient } from '@/utils/supabase/admin'
import {
  getActiveAdminHouse,
  getAdminHouses,
  getDependentHouse,
  getHouseAssignees,
  getSessionProfile,
} from '@/utils/house'
import { getMyNotifications } from '@/utils/notifications'
import { isAchievementClaimable } from '@/utils/achievements'
import {
  getHouseQuickMessageSettings,
  getHouseTextLimitsSettings,
} from '@/utils/house-settings'
import { getActivePunishment } from '@/utils/active-punishment'
import { registerLoginDay } from '@/actions/stats'
import { DashboardNav, type NavItem } from '@/components/dashboard/dashboard-nav'
import { AchievementsAdmin } from '@/components/achievements/achievements-admin'
import { AchievementsDependent } from '@/components/achievements/achievements-dependent'
import { AlertQueueOverlay } from '@/components/alerts/alert-queue-overlay'
import { getDueComunicados } from '@/actions/comunicados'
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

const adminItems: NavItem[] = [
  { href: '/dashboard/admin', label: 'Visão geral' },
  { href: '/dashboard/admin/houses', label: 'Casas' },
  { href: '/tasks', label: 'Tarefas' },
  { href: '/rewards', label: 'Recompensas' },
  { href: '/achievements', label: 'Conquistas' },
]

const dependentItems: NavItem[] = [
  { href: '/dashboard/dependent', label: 'Visão geral' },
  { href: '/tasks', label: 'Tarefas' },
  { href: '/rewards', label: 'Recompensas' },
  { href: '/achievements', label: 'Conquistas' },
]

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

  const admin = createAdminClient()
  const isAdmin = profile.user_role === 'ADMIN'

  const [notifications, activeHouse, dependentHouse, adminHouses] =
    await Promise.all([
      getMyNotifications(user.id),
      isAdmin ? getActiveAdminHouse() : Promise.resolve(null),
      isAdmin ? Promise.resolve(null) : getDependentHouse(user.id),
      // Nomes das casas do ADMIN, para o sino (ver `tasks/page.tsx`). De graça:
      // `getActiveAdminHouse` já chama `getAdminHouses` e ambos são `React.cache`.
      isAdmin ? getAdminHouses(user.id) : Promise.resolve([]),
    ])

  const houseNames = Object.fromEntries(
    adminHouses.map((house) => [house.id, house.name])
  )

  const quickMessageSettings = !isAdmin && dependentHouse
    ? await getHouseQuickMessageSettings(dependentHouse.id)
    : undefined

  // Castigo ativo do tutor (ADR-0020): ícone de triângulo ao lado do sino, só do
  // DEPENDENT. Sem Realtime — lido no render desta tela (como os comunicados).
  const punishment =
    !isAdmin && dependentHouse
      ? await getActivePunishment(user.id, dependentHouse.id)
      : null

  // Teto de caracteres da descrição da conquista (chave `text_limits) — só o
  // ADMIN escreve descrição, então a leitura é da casa ativa dele.
  const textLimitsSettings = isAdmin && activeHouse
    ? await getHouseTextLimitsSettings(activeHouse.id)
    : undefined

  // Item "Conquistas" da nav dourado quando há resgate disponível — derivado
  // das views que o próprio render carrega (mesma regra dos cards).
  let hasClaimable = false

  let content: React.ReactNode

  if (isAdmin) {
    if (!activeHouse) {
      content = <NoHouseCard role="ADMIN" />
    } else {
      const [achievements, progress, dependents] = await Promise.all([
        admin
          .from('achievements')
          .select('*')
          .eq('house_id', activeHouse.id)
          .order('created_at', { ascending: true }),
        admin
          .from('dependent_achievements')
          .select(
            'id, achievement_id, profile_id, level, current_progress, unlocked_at'
          )
          .eq('house_id', activeHouse.id),
        getHouseAssignees(activeHouse.id),
      ])

      content = (
        <AchievementsAdmin
          key={activeHouse.id}
          houseId={activeHouse.id}
          initialAchievements={achievements?.data ?? []}
          dependents={dependents}
          initialProgress={progress?.data ?? []}
          textLimits={textLimitsSettings}
        />
      )
    }
  } else {
    if (!dependentHouse) {
      content = <NoHouseCard role="DEPENDENT" />
    } else {
      // Conquistas: acesso diário do dependente (APP_LOGIN_DAYS/STREAK_LOGIN_DAYS).
      // Escrita, fora do caminho do render — ver a nota no layout do dependente.
      after(() => registerLoginDay(dependentHouse.id, user.id))

      const [achievements, progress] = await Promise.all([
        admin
          .from('achievements')
          .select('*')
          .eq('house_id', dependentHouse.id)
          .order('created_at', { ascending: true }),
        admin
          .from('dependent_achievements')
          .select('id, achievement_id, level, current_progress, unlocked_at')
          .eq('house_id', dependentHouse.id)
          .eq('profile_id', user.id),
      ])

      const views = (achievements?.data ?? []).map((achievement) => ({
        achievement,
        progress:
          progress?.data?.find(
            (entry) => entry.achievement_id === achievement.id
          ) ?? null,
      }))

      hasClaimable = views.some((view) =>
        isAchievementClaimable(view.progress, view.achievement.is_repeatable)
      )

      const dueComunicados = await getDueComunicados()

      content = (
        <>
          <AchievementsDependent
            key={dependentHouse.id}
            houseId={dependentHouse.id}
            userId={user.id}
            initialViews={views}
          />
          <AlertQueueOverlay
            userId={user.id}
            initialQueue={dueComunicados}
            initialNotifications={notifications}
          />
        </>
      )
    }
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-7xl flex-col gap-6 p-4 pt-20 pb-24 md:p-6 md:pt-24 md:pb-6">
      <DashboardNav
        items={isAdmin ? adminItems : dependentItems}
        userName={profile.full_name}
        points={isAdmin ? undefined : profile.points}
        userId={user.id}
        notifications={notifications}
        role={isAdmin ? 'ADMIN' : 'DEPENDENT'}
        quickMessageSettings={quickMessageSettings}
        hasClaimableAchievement={isAdmin ? undefined : hasClaimable}
        punishment={isAdmin ? null : punishment}
        activeHouseId={isAdmin ? (activeHouse?.id ?? null) : null}
        houseNames={isAdmin ? houseNames : undefined}
      />
      <main className="flex flex-col gap-6">{content}</main>
    </div>
  )
}
import { DashboardNav, type NavItem } from '@/components/dashboard/dashboard-nav'
import { getDependentHouse, getSessionProfile } from '@/utils/house'
import { getHouseQuickMessageSettings } from '@/utils/house-settings'
import { getMyNotifications } from '@/utils/notifications'
import { registerLoginDay } from '@/actions/stats'
import { RealtimePointsListener } from '@/components/dashboard/realtime-points-listener'
import { RealtimeToastListener } from '@/components/notifications/realtime-toast-listener'
import { PushNotificationsSetup } from '@/components/notifications/push-notifications-setup'
import { PushPermissionPrompt } from '@/components/notifications/push-permission-prompt'
import { PenaltyDialog } from '@/components/notifications/penalty-dialog'
import { ComunicadoOverlay } from '@/components/comunicados/comunicado-overlay'
import { getDueComunicados } from '@/actions/comunicados'
import { NotificationItem } from '@/types/notifications'

const dependentItems: NavItem[] = [
  { href: '/dashboard/dependent', label: 'Visão geral' },
  { href: '/tasks', label: 'Tarefas' },
  { href: '/rewards', label: 'Recompensas' },
  { href: '/achievements', label: 'Conquistas' },
]

export default async function DependentDashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, profile } = await getSessionProfile()
  const [notifications, house] = await Promise.all([
    user ? getMyNotifications(user.id) : Promise.resolve([]),
    user ? getDependentHouse(user.id) : Promise.resolve(null),
  ])
  const quickMessageSettings = house
    ? await getHouseQuickMessageSettings(house.id)
    : undefined

  if (!user || !profile) {
    return null
  }

  // Comunicados "devidos" do dependente (primeira exibição pendente ou
  // repetição agendada vencida). O overlay bloqueante confirma e agenda a
  // próxima repetição; Realtime cobre publicações ao vivo.
  const dueComunicados = house ? await getDueComunicados() : []

  // Conquistas: conta o acesso diário do dependente (métricas APP_LOGIN_DAYS e
  // STREAK_LOGIN_DAYS), dia em America/Recife. BEST-EFFORT e idempotente.
  if (house) {
    await registerLoginDay(house.id, user.id)
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-5xl flex-col gap-6 p-4 pt-20 pb-24 md:p-6 md:pt-24 md:pb-6">
      <DashboardNav
        items={dependentItems}
        userName={profile?.full_name}
        points={profile?.points}
        userId={user?.id}
        notifications={notifications}
        role="DEPENDENT"
        quickMessageSettings={quickMessageSettings}
      />
      {user && <RealtimeToastListener userId={user.id} />}
      {user && <PushNotificationsSetup userId={user.id} />}
      {user && <PushPermissionPrompt userId={user.id} />}
      {user && <RealtimePointsListener userId={user.id} />}
      <PenaltyDialog
        userId={user.id}
        initialNotifications={notifications as NotificationItem[]}
      />
      {house ? (
        <ComunicadoOverlay initialQueue={dueComunicados} />
      ) : null}
      {children}
    </div>
  )
}
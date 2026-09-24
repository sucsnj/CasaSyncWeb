import { DashboardNav, type NavItem } from '@/components/dashboard/dashboard-nav'
import { getDependentHouse, getSessionProfile } from '@/utils/house'
import { getHouseQuickMessageSettings } from '@/utils/house-settings'
import { getMyNotifications } from '@/utils/notifications'
import { RealtimeToastListener } from '@/components/notifications/realtime-toast-listener'
import { PushNotificationsSetup } from '@/components/notifications/push-notifications-setup'
import { PushPermissionPrompt } from '@/components/notifications/push-permission-prompt'
import { PenaltyDialog } from '@/components/notifications/penalty-dialog'
import { NotificationItem } from '@/types/notifications'

const dependentItems: NavItem[] = [
  { href: '/dashboard/dependent', label: 'Visão geral' },
  { href: '/tasks', label: 'Tarefas' },
  { href: '/rewards', label: 'Recompensas' },
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
      <PenaltyDialog
        userId={user.id}
        initialNotifications={notifications as NotificationItem[]}
      />
      {children}
    </div>
  )
}
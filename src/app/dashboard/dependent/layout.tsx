import { DashboardNav, type NavItem } from '@/components/dashboard/dashboard-nav'
import { getSessionProfile } from '@/utils/house'
import { getMyNotifications } from '@/utils/notifications'
import { RealtimeToastListener } from '@/components/notifications/realtime-toast-listener'
import { PushNotificationsSetup } from '@/components/notifications/push-notifications-setup'

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
  const notifications = user ? await getMyNotifications(user.id) : []

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-5xl flex-col gap-6 p-4 pt-20 pb-24 md:p-6 md:pt-24 md:pb-6">
      <DashboardNav
        items={dependentItems}
        userName={profile?.full_name}
        points={profile?.points}
        userId={user?.id}
        notifications={notifications}
        role="DEPENDENT"
      />
      {user && <RealtimeToastListener userId={user.id} />}
      {user && <PushNotificationsSetup userId={user.id} />}
      {children}
    </div>
  )
}
import { DashboardNav, type NavItem } from '@/components/dashboard/dashboard-nav'
import {
  getActiveAdminHouse,
  getAdminHouses,
  getSessionProfile,
} from '@/utils/house'
import { getMyNotifications } from '@/utils/notifications'
import { RealtimeToastListener } from '@/components/notifications/realtime-toast-listener'
import { PushNotificationsSetup } from '@/components/notifications/push-notifications-setup'
import { PushPermissionPrompt } from '@/components/notifications/push-permission-prompt'

const adminItems: NavItem[] = [
  { href: '/dashboard/admin', label: 'Visão geral' },
  { href: '/dashboard/admin/houses', label: 'Casas' },
  { href: '/tasks', label: 'Tarefas' },
  { href: '/rewards', label: 'Recompensas' },
  { href: '/achievements', label: 'Conquistas' },
]

export default async function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, profile } = await getSessionProfile()
  const [notifications, activeHouse, adminHouses] = await Promise.all([
    user ? getMyNotifications(user.id) : Promise.resolve([]),
    user ? getActiveAdminHouse() : Promise.resolve(null),
    // Casas do ADMIN: o sino precisa do nome de cada uma para marcar as
    // notificações de outras casas e trocar a casa antes de navegar. De graça —
    // `getActiveAdminHouse` chama `getAdminHouses` por dentro e ambos são
    // `React.cache`, então as páginas do grupo não pagam query extra.
    user ? getAdminHouses(user.id) : Promise.resolve([]),
  ])

  const houseNames = Object.fromEntries(
    adminHouses.map((house) => [house.id, house.name])
  )

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-7xl flex-col gap-6 p-4 pt-20 pb-24 md:p-6 md:pt-24 md:pb-6">
      <DashboardNav
        items={adminItems}
        userName={profile?.full_name}
        userId={user?.id}
        notifications={notifications}
        role="ADMIN"
        activeHouseId={activeHouse?.id ?? null}
        houseNames={houseNames}
      />
      {user && <RealtimeToastListener userId={user.id} />}
      {user && <PushNotificationsSetup userId={user.id} />}
      {user && <PushPermissionPrompt userId={user.id} />}
      {children}
    </div>
  )
}
import { DashboardNav, type NavItem } from '@/components/dashboard/dashboard-nav'
import { getSessionProfile } from '@/utils/house'
import { getMyNotifications } from '@/utils/notifications'

const adminItems: NavItem[] = [
  { href: '/dashboard/admin', label: 'Visão geral' },
  { href: '/dashboard/admin/houses', label: 'Casas' },
  { href: '/tasks', label: 'Tarefas' },
  { href: '/rewards', label: 'Recompensas' },
]

export default async function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, profile } = await getSessionProfile()
  const notifications = user ? await getMyNotifications(user.id) : []

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-5xl flex-col gap-6 p-4 pt-20 pb-24 md:p-6 md:pt-24 md:pb-6">
      <DashboardNav
        items={adminItems}
        userName={profile?.full_name}
        userId={user?.id}
        notifications={notifications}
        role="ADMIN"
      />
      {children}
    </div>
  )
}
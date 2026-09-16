import { DashboardNav, type NavItem } from '@/components/dashboard/dashboard-nav'
import { getSessionProfile } from '@/utils/house'

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
  const { profile } = await getSessionProfile()

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-5xl flex-col gap-6 p-4 pt-20 pb-24 md:p-6 md:pt-24 md:pb-6">
      <DashboardNav
        items={dependentItems}
        userName={profile?.full_name}
        points={profile?.points}
      />
      {children}
    </div>
  )
}
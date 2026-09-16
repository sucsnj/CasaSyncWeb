import { DashboardNav, type NavItem } from '@/components/dashboard/dashboard-nav'

const adminItems: NavItem[] = [
  { href: '/dashboard/admin', label: 'Visão geral' },
  { href: '/dashboard/admin/houses', label: 'Casas' },
  { href: '/tasks', label: 'Tarefas' },
  { href: '/rewards', label: 'Recompensas' },
]

export default function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-5xl flex-col gap-6 p-4 pb-24 md:p-6 md:pb-6">
      <DashboardNav items={adminItems} />
      {children}
    </div>
  )
}
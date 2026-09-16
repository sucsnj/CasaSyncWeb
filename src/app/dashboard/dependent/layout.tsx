import { DashboardNav, type NavItem } from '@/components/dashboard/dashboard-nav'

const dependentItems: NavItem[] = [
  { href: '/dashboard/dependent', label: 'Visão geral' },
  { href: '/tasks', label: 'Tarefas' },
  { href: '/rewards', label: 'Recompensas' },
]

export default function DependentDashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-5xl flex-col gap-6 p-4 md:p-6">
      <DashboardNav items={dependentItems} />
      {children}
    </div>
  )
}
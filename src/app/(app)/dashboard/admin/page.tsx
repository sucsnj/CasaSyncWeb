import type { Metadata } from 'next'
import { AdminOverviewScreen } from '@/components/screens/admin-overview-screen'

export const metadata: Metadata = {
  title: 'Visão geral',
}

export default function AdminDashboardPage() {
  return (
    <main className="flex flex-col gap-6">
      <AdminOverviewScreen />
    </main>
  )
}

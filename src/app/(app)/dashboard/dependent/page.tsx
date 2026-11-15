import type { Metadata } from 'next'
import { DependentOverviewScreen } from '@/components/screens/dependent-overview-screen'

export const metadata: Metadata = {
  title: 'Visão geral',
}

export default function DependentDashboardPage() {
  return (
    <main className="flex flex-col gap-6">
      <DependentOverviewScreen />
    </main>
  )
}

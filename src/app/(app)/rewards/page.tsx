import type { Metadata } from 'next'
import { RewardsScreen } from '@/components/screens/rewards-screen'

export const metadata: Metadata = {
  title: 'Recompensas',
}

export default function RewardsPage() {
  return (
    <main className="flex flex-col gap-6">
      <RewardsScreen />
    </main>
  )
}

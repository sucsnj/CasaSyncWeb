import type { Metadata } from 'next'
import { AchievementsScreen } from '@/components/screens/achievements-screen'

export const metadata: Metadata = {
  title: 'Conquistas',
}

export default function AchievementsPage() {
  return (
    <main className="flex flex-col gap-6">
      <AchievementsScreen />
    </main>
  )
}

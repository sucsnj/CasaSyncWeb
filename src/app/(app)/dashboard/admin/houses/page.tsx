import type { Metadata } from 'next'
import { HousesScreen } from '@/components/screens/houses-screen'

export const metadata: Metadata = {
  title: 'Casas',
}

export default function AdminHousesPage() {
  return (
    <main className="flex flex-col gap-6">
      <HousesScreen />
    </main>
  )
}

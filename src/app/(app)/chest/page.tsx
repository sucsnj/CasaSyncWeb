import type { Metadata } from 'next'
import { ChestScreen } from '@/components/screens/chest-screen'

export const metadata: Metadata = {
  title: 'Baú',
}

export default function ChestPage() {
  return (
    <main className="flex flex-col gap-6">
      <ChestScreen />
    </main>
  )
}

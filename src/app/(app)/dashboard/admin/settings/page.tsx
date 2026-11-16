import type { Metadata } from 'next'
import { SettingsScreen } from '@/components/screens/settings-screen'

export const metadata: Metadata = {
  title: 'Configurações',
}

export default function AdminSettingsPage() {
  return (
    <main className="flex flex-col gap-6">
      <SettingsScreen />
    </main>
  )
}

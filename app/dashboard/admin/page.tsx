import type { Metadata } from 'next'
import { SignOutButton } from '@/components/auth/sign-out-button'

export const metadata: Metadata = {
  title: 'Painel do Administrador | CasaSync',
}

export default function AdminDashboardPage() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-medium">Painel do Administrador</h1>
        <SignOutButton />
      </header>

      <p className="text-sm text-muted-foreground">
        Em breve: gestão de casas, dependentes, tarefas e recompensas.
      </p>
    </main>
  )
}
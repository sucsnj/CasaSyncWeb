import type { Metadata } from 'next'
import { SignOutButton } from '@/components/auth/sign-out-button'

export const metadata: Metadata = {
  title: 'Minhas Tarefas | CasaSync',
}

export default function DependentDashboardPage() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-medium">Minhas Tarefas</h1>
        <SignOutButton />
      </header>

      <p className="text-sm text-muted-foreground">
        Em breve: suas tarefas, pontos e resgates de recompensas.
      </p>
    </main>
  )
}
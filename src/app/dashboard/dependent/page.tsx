import type { Metadata } from 'next'
import Link from 'next/link'
import { Gift, ListTodo } from 'lucide-react'
import { getDependentHouse, getSessionProfile } from '@/utils/house'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export const metadata: Metadata = {
  title: 'Visão geral | CasaSync',
}

export const dynamic = 'force-dynamic'

const actions = [
  {
    href: '/tasks',
    title: 'Tarefas',
    description: 'Veja e conclua suas tarefas.',
    icon: ListTodo,
    accent: 'bg-blue-100 text-blue-700',
  },
  {
    href: '/rewards',
    title: 'Recompensas',
    description: 'Troque seus pontos por prêmios.',
    icon: Gift,
    accent: 'bg-amber-100 text-amber-700',
  },
] as const

export default async function DependentDashboardPage() {
  const { user, profile } = await getSessionProfile()
  const house = user ? await getDependentHouse(user.id) : null
  const firstName = profile?.full_name?.split(' ')[0] ?? ''

  return (
    <div className="flex flex-col gap-6">
      <header className="rounded-2xl bg-gradient-to-br from-blue-600 to-sky-500 p-5 text-white shadow-md">
        <p className="text-sm font-medium text-white/80">
          {firstName ? `Bem-vindo(a), ${firstName}!` : 'Bem-vindo(a)!'}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Visão geral</h1>
        <p className="mt-1 text-sm text-white/85">
          {house
            ? `Casa: ${house.name}`
            : 'Você ainda não foi vinculado a uma casa.'}
        </p>
      </header>

      <Card className="border-0 bg-gradient-to-br from-sky-400 to-blue-500 text-white shadow-md">
        <CardHeader>
          <CardTitle className="text-white/90">Seu saldo</CardTitle>
          <CardDescription className="text-white/80">
            Pontos acumulados com tarefas aprovadas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="font-heading text-4xl font-bold tracking-tight text-white">
            {profile?.points ?? 0} pts
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {actions.map((action) => (
          <Link key={action.href} href={action.href}>
            <Card className="h-full transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md">
              <CardHeader className="gap-3">
                <span
                  className={`flex size-11 items-center justify-center rounded-xl ${action.accent}`}
                >
                  <action.icon className="size-5" />
                </span>
                <CardTitle>{action.title}</CardTitle>
                <CardDescription>{action.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
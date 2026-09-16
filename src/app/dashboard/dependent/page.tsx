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
      <header className="rounded-3xl bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white shadow-lg shadow-blue-500/25">
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

      <Card className="border-0 bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 text-white shadow-lg shadow-amber-500/20">
        <CardHeader>
          <CardTitle className="text-white/90">Seu saldo</CardTitle>
          <CardDescription className="text-white/85">
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
            <Card className="h-full transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md active:scale-[0.98]">
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
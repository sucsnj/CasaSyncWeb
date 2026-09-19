import type { Metadata } from 'next'
import Link from 'next/link'
import { Gift, House, ListTodo } from 'lucide-react'
import { getActiveAdminHouse, getSessionProfile } from '@/utils/house'
import { ProfileEditor } from '@/components/dashboard/profile-editor'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export const metadata: Metadata = {
  title: 'Visão geral',
}

export const dynamic = 'force-dynamic'

const actions = [
  {
    href: '/dashboard/admin/houses',
    title: 'Casas',
    description: 'Criar, alternar e ver membros.',
    icon: House,
    accent: 'bg-sky-100 text-sky-700',
  },
  {
    href: '/tasks',
    title: 'Tarefas',
    description: 'Criar, editar e aprovar tarefas.',
    icon: ListTodo,
    accent: 'bg-blue-100 text-blue-700',
  },
  {
    href: '/rewards',
    title: 'Recompensas',
    description: 'Loja e aprovação de resgates.',
    icon: Gift,
    accent: 'bg-amber-100 text-amber-700',
  },
] as const

export default async function AdminDashboardPage() {
  const [{ user, profile }, activeHouse] = await Promise.all([
    getSessionProfile(),
    getActiveAdminHouse(),
  ])

  return (
    <div className="flex flex-col gap-6">
      <header className="rounded-3xl bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white shadow-lg shadow-blue-500/25">
        <p className="text-sm font-medium text-white/80">Área do administrador</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Visão geral</h1>
        <p className="mt-1 text-sm text-white/85">
          {activeHouse
            ? `Casa ativa: ${activeHouse.name}`
            : 'Nenhuma casa ativa ainda — crie a primeira.'}
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
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

      {user && profile ? (
        <ProfileEditor
          userId={user.id}
          fullName={profile.full_name}
          avatarUrl={profile.avatar_url}
        />
      ) : null}
    </div>
  )
}
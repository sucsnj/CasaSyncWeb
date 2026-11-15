'use client'

import Link from 'next/link'
import { House, Megaphone, Package, SlidersHorizontal } from 'lucide-react'
import { useAppSession } from '@/components/session/app-session'
import { useShellBundle } from '@/hooks/queries/use-shell'
import { ProfileEditor } from '@/components/dashboard/profile-editor'
import { PageSkeleton } from '@/components/ui/page-skeleton'
import { QueryError } from '@/components/session/query-error'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

const actions = [
  {
    href: '/dashboard/admin/houses',
    title: 'Casas',
    description: 'Criar, alternar e ver membros.',
    icon: House,
    accent: 'bg-sky-100 text-sky-700',
  },
  {
    href: '/dashboard/admin/settings',
    title: 'Configurações',
    description: 'Economia de pontos e mensagem rápida.',
    icon: SlidersHorizontal,
    accent: 'bg-violet-100 text-violet-700',
  },
  {
    href: '/dashboard/admin/comunicados',
    title: 'Comunicados',
    description: 'Avisos que os dependentes confirmam.',
    icon: Megaphone,
    accent: 'bg-rose-100 text-rose-700',
  },
  {
    href: '/chest',
    title: 'Baú',
    description: 'Arquivos que os dependentes podem consultar.',
    icon: Package,
    accent: 'bg-amber-100 text-amber-700',
  },
] as const

export function AdminOverviewScreen() {
  const { userId } = useAppSession()
  const { data, isPending, refetch } = useShellBundle(userId)

  if (isPending && !data) return <PageSkeleton cards={4} />
  if (!data) return <QueryError onRetry={() => void refetch()} />

  const { profile, houseName } = data
  const firstName = profile.full_name?.split(' ')[0] ?? ''

  return (
    <div className="flex flex-col gap-6">
      <header className="rounded-3xl bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white shadow-lg shadow-blue-500/25">
        <p className="text-sm font-medium text-white/80">
          {firstName ? `Bem-vindo, ${firstName}!` : 'Bem-vindo!'}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Visão geral</h1>
        <p className="mt-1 text-sm text-white/85">
          Casa ativa:{' '}
          {houseName ? (
            <span className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-sm font-semibold text-white">
              {houseName}
            </span>
          ) : (
            'Nenhuma casa ativa ainda — crie a primeira.'
          )}
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

      <ProfileEditor
        userId={userId}
        fullName={profile.full_name}
        avatarUrl={profile.avatar_url}
      />
    </div>
  )
}

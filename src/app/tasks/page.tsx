import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createAdminClient } from '@/utils/supabase/admin'
import {
  getActiveAdminHouse,
  getDependentHouse,
  getHouseAssignees,
  getProfileNames,
  getSessionProfile,
} from '@/utils/house'
import { DashboardNav, type NavItem } from '@/components/dashboard/dashboard-nav'
import { TasksAdmin } from '@/components/tasks/tasks-admin'
import { TasksDependent } from '@/components/tasks/tasks-dependent'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export const metadata: Metadata = {
  title: 'Tarefas | CasaSync',
}

export const dynamic = 'force-dynamic'

const adminItems: NavItem[] = [
  { href: '/dashboard/admin', label: 'Visão geral' },
  { href: '/dashboard/admin/houses', label: 'Casas' },
  { href: '/tasks', label: 'Tarefas' },
  { href: '/rewards', label: 'Recompensas' },
]

const dependentItems: NavItem[] = [
  { href: '/dashboard/dependent', label: 'Visão geral' },
  { href: '/tasks', label: 'Tarefas' },
  { href: '/rewards', label: 'Recompensas' },
]

function NoHouseCard({ role }: { role: 'ADMIN' | 'DEPENDENT' }) {
  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>Nenhuma casa ativa</CardTitle>
        <CardDescription>
          {role === 'ADMIN'
            ? 'Crie ou selecione uma casa antes de gerenciar tarefas.'
            : 'Você ainda não foi vinculado a uma casa.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {role === 'ADMIN' ? (
          <Link
            href="/dashboard/admin/houses"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Gerenciar casas →
          </Link>
        ) : null}
      </CardContent>
    </Card>
  )
}

export default async function TasksPage() {
  const { user, profile } = await getSessionProfile()

  if (!user || !profile) {
    redirect('/login')
  }

  // Service-role: a visibilidade é decidida pela posse/co-controle da casa
  // (sessão), não por policies RLS — o co-gerente precisa ver as tarefas da
  // casa mesmo não sendo o `owner_id`.
  const admin = createAdminClient()
  const isAdmin = profile.user_role === 'ADMIN'

  let content: React.ReactNode

  if (isAdmin) {
    const activeHouse = await getActiveAdminHouse()
    if (!activeHouse) {
      content = <NoHouseCard role="ADMIN" />
    } else {
      const { data: tasks } = await admin
        .from('tasks')
        .select('*')
        .eq('house_id', activeHouse.id)
        .order('created_at', { ascending: false })

      const assignees = await getHouseAssignees(activeHouse.id)

      content = (
        <TasksAdmin
          key={activeHouse.id}
          houseId={activeHouse.id}
          initialTasks={tasks ?? []}
          assignees={assignees}
        />
      )
    }
  } else {
    const house = await getDependentHouse(user.id)
    if (!house) {
      content = <NoHouseCard role="DEPENDENT" />
    } else {
      const { data: tasks } = await admin
        .from('tasks')
        .select('*')
        .eq('house_id', house.id)
        .eq('assigned_to', user.id)
        .order('created_at', { ascending: false })

      const taskList = tasks ?? []
      const creatorNames = await getProfileNames(
        taskList.map((task) => task.created_by)
      )

      content = (
        <TasksDependent
          key={house.id}
          houseId={house.id}
          initialTasks={taskList}
          creatorNames={creatorNames}
        />
      )
    }
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-5xl flex-col gap-6 p-4 pt-20 pb-24 md:p-6 md:pt-24 md:pb-6">
      <DashboardNav
        items={isAdmin ? adminItems : dependentItems}
        userName={profile.full_name}
        points={profile.points}
      />
      <main className="flex flex-col gap-6">{content}</main>
    </div>
  )
}
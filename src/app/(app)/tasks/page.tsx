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
import {
  getHouseExtensionRulesSettings,
  getHouseTaskDecaySettings,
  getHouseTaskSlaSettings,
  getHouseTextLimitsSettings,
} from '@/utils/house-settings'
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
  title: 'Tarefas',
}

export const dynamic = 'force-dynamic'

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

  // A casa que dá contexto à tela (ativa p/ ADMIN, do dependente). O shell
  // (nav, sino, castigo, comunicados) vive no `layout.tsx` do grupo `(app)` —
  // aqui só interessa a casa para carregar os cards. A sessão é reutilizada
  // entre as chamadas via `React.cache` em `utils/house.ts`.
  const [activeHouse, dependentHouse] = await Promise.all([
    isAdmin ? getActiveAdminHouse() : Promise.resolve(null),
    isAdmin ? Promise.resolve(null) : getDependentHouse(user.id),
  ])

  // Settings de prazos/SLA e de adiamento da casa, aplicadas nos cards de
  // tarefas (prazo padrão, chip "Prazo próximo" e botões de adiamento).
  const houseIdForSettings = isAdmin ? activeHouse?.id : dependentHouse?.id
  const taskSlaSettings = houseIdForSettings
    ? await getHouseTaskSlaSettings(houseIdForSettings)
    : undefined
  const extensionRulesSettings = isAdmin && houseIdForSettings
    ? await getHouseExtensionRulesSettings(houseIdForSettings)
    : undefined
  const taskDecaySettings = houseIdForSettings
    ? await getHouseTaskDecaySettings(houseIdForSettings)
    : undefined
  // Teto de caracteres da descrição (chave `text_limits`). Sai no mesmo
  // `getHouseSettingsMap` das três leituras acima — zero round-trip extra.
  const textLimitsSettings = isAdmin && houseIdForSettings
    ? await getHouseTextLimitsSettings(houseIdForSettings)
    : undefined

  let content: React.ReactNode

  if (isAdmin) {
    if (!activeHouse) {
      content = <NoHouseCard role="ADMIN" />
    } else {
      const [{ data: tasks }, assignees] = await Promise.all([
        admin
          .from('tasks')
          .select('*')
          .eq('house_id', activeHouse.id)
          .order('created_at', { ascending: false }),
        getHouseAssignees(activeHouse.id),
      ])

      content = (
        <TasksAdmin
          key={activeHouse.id}
          houseId={activeHouse.id}
          initialTasks={tasks ?? []}
          assignees={assignees}
          defaultDueDays={taskSlaSettings?.defaultDueDays}
          dueSoonHours={taskSlaSettings?.dueSoonHours}
          extensionDayOptions={extensionRulesSettings?.dayOptions}
          maxExtensions={extensionRulesSettings?.maxExtensions}
          taskDecay={taskDecaySettings}
          textLimits={textLimitsSettings}
        />
      )
    }
  } else {
    if (!dependentHouse) {
      content = <NoHouseCard role="DEPENDENT" />
    } else {
      const { data: tasks } = await admin
        .from('tasks')
        .select('*')
        .eq('house_id', dependentHouse.id)
        .eq('assigned_to', user.id)
        // Tarefa em espera (ON_HOLD) fica INVISÍVEL para o dependente — o mesmo
        // guarantee das guards das actions (que exigem PENDING/IN_PROGRESS).
        .neq('status', 'ON_HOLD')
        .order('created_at', { ascending: false })

      const taskList = tasks ?? []
      const creatorNames = await getProfileNames(
        taskList.map((task) => task.created_by)
      )

      content = (
        <TasksDependent
          key={dependentHouse.id}
          houseId={dependentHouse.id}
          initialTasks={taskList}
          creatorNames={creatorNames}
          dueSoonHours={taskSlaSettings?.dueSoonHours}
          taskDecay={taskDecaySettings}
        />
      )
    }
  }

  return <main className="flex flex-col gap-6">{content}</main>
}
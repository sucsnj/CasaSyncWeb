import type { Metadata } from 'next'
import type { Tables } from '@/types/database'
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createAdminClient } from '@/utils/supabase/admin'
import { fetchTasksForCache } from '@/actions/tasks'
import { queryKeys } from '@/lib/query-keys'
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
  getHouseAttachmentSettings,
} from '@/utils/house-settings'
import type { ChestItemView } from '@/components/chest/chest-types'
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

type TaskRow = Tables<'tasks'>

/** Carrega o mapa id → item do baú para as tarefas que usam espelho. */
async function loadChestItems(
  admin: ReturnType<typeof createAdminClient>,
  rows: TaskRow[]
): Promise<Record<string, ChestItemView>> {
  const ids = [
    ...new Set(
      rows
        .map((task) => task.attachment_chest_item_id)
        .filter((id): id is string => Boolean(id))
    ),
  ]
  if (ids.length === 0) return {}
  const { data } = await admin
    .from('chest_items')
    .select('*')
    .in('id', ids)
  return Object.fromEntries((data ?? []).map((item) => [item.id, item]))
}

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
  // A casa permite anexos em tarefa? (ADR-0026). Lido para os **dois** papéis: o
  // ADMIN precisa saber se esconde o input, e o dependente se o anexo abre. Mesmo
  // `getHouseSettingsMap` das leituras acima — zero round-trip extra.
  const attachmentSettings = houseIdForSettings
    ? await getHouseAttachmentSettings(houseIdForSettings)
    : undefined

  let content: React.ReactNode

  if (isAdmin) {
    if (!activeHouse) {
      content = <NoHouseCard role="ADMIN" />
    } else {
      // UMA leitura de tarefas nesta tela: a mesma action serve o render do
      // servidor (prop `initialTasks`) e o cache do cliente (hidratação). Nada
      // é lido duas vezes — nem no servidor, nem no cliente.
      const queryClient = new QueryClient()
      const tasks = await queryClient.fetchQuery({
        queryKey: queryKeys.tasks.house(activeHouse.id),
        queryFn: async () => {
          const result = await fetchTasksForCache()
          if (!result.ok) throw new Error(result.error)
          return result.data
        },
      })
      const [assignees, chestItems] = await Promise.all([
        getHouseAssignees(activeHouse.id),
        loadChestItems(admin, tasks ?? []),
      ])
      const dehydratedState = dehydrate(queryClient)

      content = (
        <HydrationBoundary state={dehydratedState}>
          <TasksAdmin
            key={activeHouse.id}
            houseId={activeHouse.id}
            initialTasks={tasks ?? []}
            chestItems={chestItems}
            assignees={assignees}
            defaultDueDays={taskSlaSettings?.defaultDueDays}
            dueSoonHours={taskSlaSettings?.dueSoonHours}
            extensionDayOptions={extensionRulesSettings?.dayOptions}
            maxExtensions={extensionRulesSettings?.maxExtensions}
            taskDecay={taskDecaySettings}
            textLimits={textLimitsSettings}
            attachmentsAllowed={attachmentSettings?.tasksAllowed}
          />
        </HydrationBoundary>
      )
    }
  } else {
    if (!dependentHouse) {
      content = <NoHouseCard role="DEPENDENT" />
    } else {
      // Mesma leitura única do caminho do ADMIN (a action resolve o papel).
      const queryClient = new QueryClient()
      const taskList = await queryClient.fetchQuery({
        queryKey: queryKeys.tasks.dependent(user.id),
        queryFn: async () => {
          const result = await fetchTasksForCache()
          if (!result.ok) throw new Error(result.error)
          return result.data
        },
      })
      const [chestItems, creatorNames] = await Promise.all([
        loadChestItems(admin, taskList ?? []),
        getProfileNames((taskList ?? []).map((task) => task.created_by)),
      ])
      const dehydratedState = dehydrate(queryClient)

      content = (
        <HydrationBoundary state={dehydratedState}>
          <TasksDependent
            key={dependentHouse.id}
            houseId={dependentHouse.id}
            userId={user.id}
            initialTasks={taskList ?? []}
            chestItems={chestItems}
            creatorNames={creatorNames}
            dueSoonHours={taskSlaSettings?.dueSoonHours}
            taskDecay={taskDecaySettings}
            attachmentsAllowed={attachmentSettings?.tasksAllowed}
          />
        </HydrationBoundary>
      )
    }
  }

  return <main className="flex flex-col gap-6">{content}</main>
}
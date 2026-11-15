'use client'

import { useMemo, useState } from 'react'
import { CircleCheck, ChevronDown, Clock3, ListTodo, Sparkles, UserRound } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { completeTask, requestTaskExtension } from '@/actions/tasks'
import { usePostgresChanges } from '@/hooks/use-postgres-changes'
import { useOptimisticAction } from '@/hooks/use-optimistic-action'
import { usePersistedSort } from '@/hooks/use-persisted-sort'
import { SortSelect } from '@/components/ui/sort-select'
import { PageSkeleton } from '@/components/ui/page-skeleton'
import { QueryError } from '@/components/session/query-error'
import { sortBy } from '@/utils/sort'
import { useExpandedIds } from '@/hooks/use-expanded-ids'
import {
  useTasksBundle,
  useInvalidateTasks,
  upsertTaskInBundle,
  deleteTaskFromBundle,
} from '@/hooks/queries/use-tasks'
import type { ChestItemView } from '@/components/chest/chest-types'
import { getTaskSlaStatus } from '@/utils/task-sla'
import { getTaskCurrentPoints, getTaskDecayStart } from '@/utils/task-decay'
import { DEFAULT_TASK_DECAY } from '@/utils/settings'
import type { Tables } from '@/types/database'
import { cn } from '@/lib/utils'
import { taskAttachmentView } from '@/utils/task-attachment-view'
import { parseRichText } from '@/components/ui/rich-text'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { CardColumns } from '@/components/ui/card-columns'
import { EmptyState } from '@/components/ui/empty-state'
import { FormattedDateTime } from '@/components/ui/formatted-date'
import { Modal } from '@/components/ui/modal'
import { TaskAttachmentView } from './task-attachment-view'
import {
  POINTS_PILL_CLASS,
  taskAccentByStatus,
  taskChipByStatus,
  taskExtensionChip,
  taskSlaBadge,
  taskSlaCardClass,
} from './task-styles'

type Task = Tables<'tasks'>

const EMPTY_TASKS: Task[] = []
const EMPTY_CHEST_MAP: Record<string, ChestItemView> = {}
const EMPTY_NAMES: Record<string, string> = {}

export function TasksDependent({
  houseId,
}: {
  houseId: string
}) {
  const { data, isPending: bundlePending, refetch } = useTasksBundle(houseId)
  const tasks = data?.tasks ?? EMPTY_TASKS
  const chestItemsMap = data?.chestItems ?? EMPTY_CHEST_MAP
  const creatorNames = data?.creatorNames ?? EMPTY_NAMES
  const decay = data?.settings.taskDecay ?? DEFAULT_TASK_DECAY
  const dueSoonHours = data?.settings.dueSoonHours ?? 4
  const attachmentsAllowed = data?.settings.attachmentsAllowed ?? true
  const queryClient = useQueryClient()
  const invalidateTasks = useInvalidateTasks()
  const [sortOpen, setSortOpen] = usePersistedSort('sort:tasks-dependent:open', 'created:desc')
  const [sortDone, setSortDone] = usePersistedSort('sort:tasks-dependent:done', 'created:desc')
  const [error, setError] = useState<string | null>(null)
  const [extendingTask, setExtendingTask] = useState<Task | null>(null)
  const [extensionError, setExtensionError] = useState<string | null>(null)
  const { expandedIds, isHydrated, toggle: toggleExpanded } = useExpandedIds({
    storageKey: `casasync:expanded:tasks-dependent:${houseId}`,
  })
  // Pending/otimista por item compartilhado com ADMIN e recompensas.
  const { isPending, markServer, runOptimistic } =
    useOptimisticAction()
  // O pedido de adiamento sai de um Modal de instância única (não de um card
  // repetido), então um flag próprio é mais simples que o Set — e não sofre com
  // o `setExtendingTask(null)` do sucesso, que desmonta o botão.
  const [sendingExtension, setSendingExtension] = useState(false)

  // A fonte da verdade agora é o query cache (inicializado pela RSC e
  // persistido em IndexedDB). Realtime patcha direto no cache: chega evento →
  // card muda de seção sem refresh nem piscar.
  usePostgresChanges<Task>({
    table: 'tasks',
    filter: `house_id=eq.${houseId}`,
    onUpsert: (task) => {
      // Chegou linha REAL do servidor → sai do registro de otimistas.
      markServer(task.id)
      upsertTaskInBundle(queryClient, houseId, task)
    },
    onDelete: (taskId) => deleteTaskFromBundle(queryClient, houseId, taskId),
  })

  function handleComplete(task: Task) {
    setError(null)
    // Otimista ANTES do `await`: o card muda de seção na hora. O `completed_at`
    // é aproximado (o valor exato é o do servidor) e o Realtime/refresh corrige.
    void runOptimistic({
      current: task,
      optimistic: {
        ...task,
        status: 'COMPLETED',
        completed_at: new Date().toISOString(),
      },
      apply: (item) => upsertTaskInBundle(queryClient, houseId, item),
      action: () => completeTask(task.id),
      onSuccess: () => {
        toast.success('Tarefa concluída! Aguardando aprovação.')
        void invalidateTasks(houseId)
      },
      onError: (message) => {
        setError(message)
        toast.error(message)
      },
      onNetworkError: (message) => {
        void invalidateTasks(houseId)
        setError(message)
        toast.error(message)
      },
    })
  }

  function handleRequestExtension(task: Task, form: HTMLFormElement) {
    if (sendingExtension) return
    setExtensionError(null)
    const data = new FormData(form)
    const reason = String(data.get('extensionReason') ?? '')
    form.reset()
    setSendingExtension(true)
    void runOptimistic({
      current: task,
      // Otimista: o banner "Pedido de adiamento" e a somatória aparecem na hora,
      // e o botão "Pedir mais tempo" some (o card já não tem `due_date` livre).
      optimistic: {
        ...task,
        extension_requested: true,
        extension_reason: reason,
      },
      apply: (item) => upsertTaskInBundle(queryClient, houseId, item),
      action: () => requestTaskExtension(task.id, reason),
      onSuccess: () => {
        toast.success('Pedido de adiamento enviado!')
        setExtendingTask(null)
        void invalidateTasks(houseId)
      },
      onError: (message) => {
        setExtensionError(message)
        toast.error(message)
      },
      onNetworkError: (message) => {
        void invalidateTasks(houseId)
        setExtensionError(message)
        toast.error(message)
      },
    }).finally(() => setSendingExtension(false))
  }

  const openTasks = useMemo(() => {
    const [key, direction] = sortOpen.split(':')
    const getter = (task: Task) => {
      switch (key) {
        case 'title':
          return task.title
        case 'points':
          return task.points
        case 'due':
          return task.due_date
        case 'created':
        default:
          return task.created_at
      }
    }
    return sortBy(
      tasks.filter(
        (task) =>
          task.status === 'PENDING' ||
          task.status === 'IN_PROGRESS' ||
          task.status === 'NOT_DELIVERED'
      ),
      getter,
      direction === 'desc' ? 'desc' : 'asc'
    )
  }, [tasks, sortOpen])

  const awaitingTasks = tasks.filter((task) => task.status === 'COMPLETED')
  const doneTasks = useMemo(() => {

    const [key, direction] = sortDone.split(':')
    const getter = (task: Task) => {
      switch (key) {
        case 'title':
          return task.title
        case 'points':
          return task.points
        case 'due':
          return task.due_date
        case 'created':
        default:
          return task.created_at
      }
    }
    return sortBy(
      tasks.filter((task) => task.status === 'APPROVED'),
      getter,
      direction === 'desc' ? 'desc' : 'asc'
    )
  }, [tasks, sortDone])

  // 1ª visita sem cache: skeleton completo; com cache (IndexedDB) renderiza na
  // hora — o refetch fica em background. Erro sem cache: card com retry.
  if (bundlePending && !data) return <PageSkeleton cards={3} />
  if (!data) return <QueryError onRetry={() => void refetch()} />

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <p
          className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-slate-800">
            <ListTodo className="size-4 text-blue-600" />
            Suas tarefas
          </h2>
          <SortSelect
            value={sortOpen}
            onChange={setSortOpen}
            options={[
              { value: 'created:desc', label: 'Mais recentes' },
              { value: 'created:asc', label: 'Mais antigas' },
              { value: 'title:asc', label: 'Título (A-Z)' },
              { value: 'title:desc', label: 'Título (Z-A)' },
              { value: 'points:desc', label: 'Mais pontos' },
              { value: 'points:asc', label: 'Menos pontos' },
              { value: 'due:asc', label: 'Prazo (próximo)' },
              { value: 'due:desc', label: 'Prazo (distante)' },
            ]}
          />
        </div>

        {openTasks.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            accent="bg-sky-100 text-sky-600"
            title="Nenhuma tarefa pendente"
            message="Tudo limpo por aqui! Aproveite o momento. 🎉"
          />
        ) : (
          <CardColumns className="gap-x-3 xl:columns-2 [&>*]:mb-3">
            {openTasks.map((task) => {
              const sla = getTaskSlaStatus(
                task.due_date,
                new Date(),
                dueSoonHours
              )
              const slaInfo = taskSlaBadge[sla]
              // "Não entregue" tem card próprio (borda vermelha) e some o badge
              // de SLA — o chip vermelho já comunica o estado.
              const isNotDelivered = task.status === 'NOT_DELIVERED'
              // Valor corrente sob o decaimento (o que o dependente recebe se concluir).
              const currentPoints = getTaskCurrentPoints(
                task.points,
                getTaskDecayStart(task.created_at, task.decay_started_at),
                task.due_date,
                decay
              )
              const cardClass =
                isNotDelivered || sla === 'normal'
                  ? cn('border-l-4', taskAccentByStatus[task.status])
                  : taskSlaCardClass[sla]
  
              return (
                <Card key={task.id} className={cardClass}>
                  <CardContent className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <div className="min-w-0 flex-1">
                      {/* Anexo: miniatura (imagem) ou chip com ícone — clicar
                          abre o arquivo em uma nova aba do navegador. */}
                      {(() => {
                        const attachmentView = taskAttachmentView(task, chestItemsMap)
                        return attachmentView ? (
                          <TaskAttachmentView
                            url={attachmentView.url}
                            name={attachmentView.name}
                            type={attachmentView.type}
                            taskId={task.id}
                            htmlHref={attachmentView.htmlHref}
                            hideFileName
                            blocked={!attachmentsAllowed}
                          />
                        ) : null
                      })()}
                      <p className="font-semibold text-slate-800">{task.title}</p>
                      {task.description ? (
                        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-500">
                          {parseRichText(task.description)}
                        </p>
                      ) : null}
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        {!isNotDelivered && slaInfo ? (
                          <span
                            className={cn(
                              'rounded-full px-2.5 py-1 text-xs font-medium',
                              slaInfo.className
                            )}
                          >
                            {slaInfo.label}
                          </span>
                        ) : null}
                        <span
                          className={cn(
                            'rounded-full px-2.5 py-1 text-xs font-medium',
                            taskChipByStatus[task.status].className
                          )}
                        >
                          {taskChipByStatus[task.status].label}
                        </span>
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-sm font-semibold',
                            POINTS_PILL_CLASS
                          )}
                        >
                          {currentPoints < task.points ? (
                            <>
                              {currentPoints} pts{' '}
                              <span className="font-normal line-through opacity-60">
                                {task.points}
                              </span>
                            </>
                          ) : (
                            `${task.points} pts`
                          )}
                        </span>
                        {task.due_date ? (
                          <span className="text-sm text-slate-500">
                            até <FormattedDateTime iso={task.due_date} />
                          </span>
                        ) : null}
                        {task.extension_requested ? (
                          <span
                            className={cn(
                              'shrink-0',
                              taskExtensionChip.className
                            )}
                          >
                            <Clock3 className="size-3" />
                            {taskExtensionChip.label}
                          </span>
                        ) : null}
                      </div>
                      {creatorNames[task.created_by] ? (
                        <p className="mt-1 flex items-center gap-1 text-xs font-medium text-slate-400">
                          <UserRound className="size-3.5" />
                          Criada por {creatorNames[task.created_by]}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto">
                      {isNotDelivered ? (
                        <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                          Marcada como não entregue. Peça mais tempo para reabrir
                          a tarefa.
                        </p>
                      ) : (
                        <Button
                          onClick={() => handleComplete(task)}
                          disabled={isPending(task.id)}
                          className="w-full bg-emerald-500 shadow-lg shadow-emerald-500/25 hover:bg-emerald-600 sm:w-auto"
                        >
                          {isPending(task.id)
                            ? 'Enviando...'
                            : 'Concluir tarefa'}
                        </Button>
                      )}
                      {task.due_date && !task.extension_requested ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-h-9 w-full text-slate-600 sm:w-auto"
                          onClick={() => {
                            setExtensionError(null)
                            setExtendingTask(task)
                          }}
                        >
                          <Clock3 className="size-3.5" />
                          Pedir mais tempo
                        </Button>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </CardColumns>
        )}
      </section>

      {awaitingTasks.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-base font-semibold text-slate-800">
            Aguardando aprovação
          </h2>
          <CardColumns className="gap-x-3 xl:columns-2 [&>*]:mb-3">
            {awaitingTasks.map((task) => {
              const isExpanded = expandedIds.has(task.id)
              // Valor corrente sob o decaimento (o que será aprovado/creditado).
              const currentPoints = getTaskCurrentPoints(
                task.points,
                getTaskDecayStart(task.created_at, task.decay_started_at),
                task.due_date,
                decay
              )
              return (
                <Card
                  key={task.id}
                  className="border-l-4 border-l-amber-400"
                >
                  <CardContent className="flex flex-col gap-2 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => toggleExpanded(task.id)}
                        aria-expanded={isExpanded}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <p className="min-w-0 flex-1 truncate font-semibold text-slate-800">
                          {task.title}
                        </p>
                        <ChevronDown
                          className={cn(
                            'size-4 shrink-0 text-slate-400',
                            isHydrated && 'transition-transform duration-200',
                            isExpanded && 'rotate-180'
                          )}
                        />
                      </button>
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-2.5 py-1 text-xs font-medium',
                          taskChipByStatus.COMPLETED.className
                        )}
                      >
                        {taskChipByStatus.COMPLETED.label}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {currentPoints < task.points ? (
                        <>
                          <span className="font-semibold text-slate-600">
                            {currentPoints} pts
                          </span>{' '}
                          <span className="line-through opacity-60">
                            {task.points}
                          </span>{' '}
                          · o administrador precisa aprovar
                        </>
                      ) : (
                        <>
                          {task.points} pts · o administrador precisa
                          aprovar
                        </>
                      )}
                    </p>
                    {creatorNames[task.created_by] ? (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                        <UserRound className="size-3.5" />
                        Criada por {creatorNames[task.created_by]}
                      </p>
                    ) : null}
                    {isExpanded && task.description ? (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-500">{parseRichText(task.description)}</p>
                    ) : null}
                  </CardContent>
                </Card>
              )
            })}
          </CardColumns>
        </section>
      ) : null}

       {doneTasks.length > 0 ? (
         <section className="flex flex-col gap-3">
           <div className="flex items-center justify-between gap-3">
             <h2 className="font-heading text-base font-semibold text-slate-800">
               Concluídas
             </h2>
             <SortSelect
               value={sortDone}
               onChange={setSortDone}
               options={[
                 { value: 'created:desc', label: 'Mais recentes' },
                 { value: 'created:asc', label: 'Mais antigas' },
                 { value: 'title:asc', label: 'Título (A-Z)' },
                 { value: 'title:desc', label: 'Título (Z-A)' },
                 { value: 'points:desc', label: 'Mais pontos' },
                 { value: 'points:asc', label: 'Menos pontos' },
                 { value: 'due:asc', label: 'Prazo (próximo)' },
                 { value: 'due:desc', label: 'Prazo (distante)' },
               ]}
             />
           </div>
          <CardColumns className="gap-x-3 xl:columns-2 [&>*]:mb-3">
            {doneTasks.map((task) => {
              const isExpanded = expandedIds.has(task.id)
              return (
                <Card
                  key={task.id}
                  className="border-l-4 border-l-emerald-500"
                >
                  <CardContent className="flex flex-col gap-2 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => toggleExpanded(task.id)}
                        aria-expanded={isExpanded}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <p className="min-w-0 flex-1 truncate font-semibold text-slate-800">
                          {task.title}
                        </p>
                        <ChevronDown
                          className={cn(
                            'size-4 shrink-0 text-slate-400',
                            isHydrated && 'transition-transform duration-200',
                            isExpanded && 'rotate-180'
                          )}
                        />
                      </button>
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-2.5 py-1 text-xs font-medium',
                          taskChipByStatus.APPROVED.className
                        )}
                      >
                        {taskChipByStatus.APPROVED.label}
                      </span>
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
                      <CircleCheck className="size-4 shrink-0 text-emerald-500" />
                      {task.points} pts · pontos creditados
                    </p>
                    {creatorNames[task.created_by] ? (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                        <UserRound className="size-3.5" />
                        Criada por {creatorNames[task.created_by]}
                      </p>
                    ) : null}
                    {isExpanded && task.description ? (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-500">{parseRichText(task.description)}</p>
                    ) : null}
                  </CardContent>
                </Card>
              )
            })}
          </CardColumns>
        </section>
      ) : null}

      <Modal
        open={!!extendingTask}
        onClose={() => setExtendingTask(null)}
        title={`Pedir mais tempo — ${extendingTask?.title ?? ''}`}
      >
        {extensionError ? (
          <p
            className="mb-3 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            {extensionError}
          </p>
        ) : null}
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (extendingTask) {
              handleRequestExtension(extendingTask, event.currentTarget)
            }
          }}
          className="flex flex-col gap-4"
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-slate-700">
              Justificativa
            </span>
            <textarea
              name="extensionReason"
              required
              maxLength={500}
              rows={3}
              placeholder="Explique o motivo: provas, viagem, compromissos…"
              className="min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            />
          </label>
<Button type="submit" disabled={sendingExtension} className="w-full">
            {sendingExtension ? 'Enviando...' : 'Enviar pedido'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}
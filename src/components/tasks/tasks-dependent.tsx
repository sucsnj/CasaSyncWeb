'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CircleCheck, Clock3, ListTodo, Sparkles, UserRound } from 'lucide-react'
import { completeTask, requestTaskExtension } from '@/actions/tasks'
import { usePostgresChanges } from '@/hooks/use-postgres-changes'
import { getTaskSlaStatus } from '@/utils/task-sla'
import type { Tables } from '@/types/database'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Modal } from '@/components/ui/modal'
import {
  POINTS_PILL_CLASS,
  taskAccentByStatus,
  taskChipByStatus,
  taskSlaBadge,
  taskSlaCardClass,
} from './task-styles'

type Task = Tables<'tasks'>

function upsertTask(list: Task[], task: Task): Task[] {
  const exists = list.some((item) => item.id === task.id)
  const next = exists
    ? list.map((item) => (item.id === task.id ? task : item))
    : [task, ...list]
  return next.sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export function TasksDependent({
  houseId,
  initialTasks,
  creatorNames,
}: {
  houseId: string
  initialTasks: Task[]
  creatorNames: Record<string, string>
}) {
  const router = useRouter()
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [extendingTask, setExtendingTask] = useState<Task | null>(null)
  const [extensionError, setExtensionError] = useState<string | null>(null)

  // ENSINO (teach): o evento de UPDATE é recebido ao vivo. Quando o ADMIN
  // aprova (APPROVED) a lista muda na hora; quando o ADMIN cria (INSERT) uma
  // nova tarefa para este dependente, ela aparece sem refresh. O RLS do lado
  // do servidor garante que só cheguem tarefas às quais este usuário tem
  // acesso de leitura — embora o filter seja por casa.
  usePostgresChanges<Task>({
    table: 'tasks',
    filter: `house_id=eq.${houseId}`,
    onUpsert: (task) => setTasks((prev) => upsertTask(prev, task)),
    onDelete: (taskId) =>
      setTasks((prev) => prev.filter((task) => task.id !== taskId)),
  })

  function handleComplete(task: Task) {
    setError(null)

    startTransition(async () => {
      try {
        const result = await completeTask(task.id)
        if (!result.ok) {
          setError(result.error)
          return
        }

        if (task.status !== 'COMPLETED' && task.status !== 'APPROVED') {
          setTasks((prev) =>
            upsertTask(prev, {
              ...task,
              status: 'COMPLETED',
              completed_at: new Date().toISOString(),
            })
          )
        }
        router.refresh()
      } catch {
        setError('Falha de conexão. Tente novamente.')
      }
    })
  }

  function handleRequestExtension(task: Task, form: HTMLFormElement) {
    setExtensionError(null)
    const data = new FormData(form)
    const reason = String(data.get('extensionReason') ?? '')
    form.reset()

    startTransition(async () => {
      try {
        const result = await requestTaskExtension(task.id, reason)
        if (!result.ok) {
          setExtensionError(result.error)
          return
        }
        setExtendingTask(null)
        setTasks((prev) =>
          upsertTask(prev, {
            ...task,
            extension_requested: true,
            extension_reason: reason,
          })
        )
        router.refresh()
      } catch {
        setExtensionError('Falha de conexão. Tente novamente.')
      }
    })
  }

  const openTasks = tasks.filter(
    (task) =>
      task.status === 'PENDING' ||
      task.status === 'IN_PROGRESS' ||
      task.status === 'NOT_DELIVERED'
  )
  const awaitingTasks = tasks.filter((task) => task.status === 'COMPLETED')
  const doneTasks = tasks.filter((task) => task.status === 'APPROVED')

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
        <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-slate-800">
          <ListTodo className="size-4 text-blue-600" />
          Suas tarefas
        </h2>

        {openTasks.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            accent="bg-sky-100 text-sky-600"
            title="Nenhuma tarefa pendente"
            message="Tudo limpo por aqui! Aproveite o momento. 🎉"
          />
        ) : (
          openTasks.map((task) => {
            const sla = getTaskSlaStatus(task.created_at, task.due_date)
            const slaInfo = taskSlaBadge[sla]
            // "Não entregue" tem card próprio (borda vermelha) e some o badge
            // de SLA — o chip vermelho já comunica o estado.
            const isNotDelivered = task.status === 'NOT_DELIVERED'
            const cardClass =
              isNotDelivered || sla === 'normal'
                ? cn('border-l-4', taskAccentByStatus[task.status])
                : taskSlaCardClass[sla]

            return (
              <Card key={task.id} className={cardClass}>
                <CardContent className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div className="min-w-0 flex-1">
                    {task.image_url ? (
                      <img
                        src={task.image_url}
                        alt=""
                        className="mb-3 h-32 w-full rounded-xl border border-slate-200 object-cover"
                      />
                    ) : null}
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-slate-800">{task.title}</p>
                      <span className="flex shrink-0 items-center gap-1.5">
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
                      </span>
                    </div>
                    {task.description ? (
                      <p className="mt-1 text-sm text-slate-500">
                        {task.description}
                      </p>
                    ) : null}
                    <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 font-semibold',
                          POINTS_PILL_CLASS
                        )}
                      >
                        {task.points} pts
                      </span>
                      {task.due_date ? (
                        <span>
                          até{' '}
                          {new Date(task.due_date).toLocaleString('pt-BR')}
                        </span>
                      ) : null}
                      {task.extension_requested ? (
                        <span className="flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                          <Clock3 className="size-3" />
                          Aguardando adiamento
                        </span>
                      ) : null}
                    </p>
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
                        disabled={pending}
                        className="w-full bg-emerald-500 shadow-lg shadow-emerald-500/25 hover:bg-emerald-600 sm:w-auto"
                      >
                        {pending ? 'Enviando...' : 'Concluir tarefa'}
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
          })
        )}
      </section>

      {awaitingTasks.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-base font-semibold text-slate-800">
            Aguardando aprovação
          </h2>
          {awaitingTasks.map((task) => (
            <Card
              key={task.id}
              className="border-l-4 border-l-amber-400"
            >
              <CardContent className="py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-slate-800">{task.title}</p>
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
                  {task.points} pts · o administrador precisa aprovar
                </p>
                {creatorNames[task.created_by] ? (
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                    <UserRound className="size-3.5" />
                    Criada por {creatorNames[task.created_by]}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </section>
      ) : null}

      {doneTasks.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-base font-semibold text-slate-800">
            Concluídas
          </h2>
          {doneTasks.map((task) => (
            <Card
              key={task.id}
              className="border-l-4 border-l-emerald-500"
            >
              <CardContent className="py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-slate-800">{task.title}</p>
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
              </CardContent>
            </Card>
          ))}
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
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? 'Enviando...' : 'Enviar pedido'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}
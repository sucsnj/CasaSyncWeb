'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CircleCheck, ListTodo } from 'lucide-react'
import { completeTask } from '@/actions/tasks'
import { usePostgresChanges } from '@/hooks/use-postgres-changes'
import type { Tables } from '@/types/database'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  POINTS_PILL_CLASS,
  taskAccentByStatus,
  taskChipByStatus,
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
}: {
  houseId: string
  initialTasks: Task[]
}) {
  const router = useRouter()
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

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

  const openTasks = tasks.filter(
    (task) => task.status === 'PENDING' || task.status === 'IN_PROGRESS'
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
          <p className="text-sm text-slate-500">
            Nenhuma tarefa pendente. Aproveite!
          </p>
        ) : (
          openTasks.map((task) => (
            <Card
              key={task.id}
              className={cn('border-l-4', taskAccentByStatus[task.status])}
            >
              <CardContent className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-slate-800">{task.title}</p>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2.5 py-1 text-xs font-medium',
                        taskChipByStatus[task.status].className
                      )}
                    >
                      {taskChipByStatus[task.status].label}
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
                  </p>
                </div>
                <Button
                  onClick={() => handleComplete(task)}
                  disabled={pending}
                  className="w-full shrink-0 sm:w-auto"
                >
                  {pending ? 'Enviando...' : 'Concluir tarefa'}
                </Button>
              </CardContent>
            </Card>
          ))
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
                  <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                    {taskChipByStatus.COMPLETED.label}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {task.points} pts · o administrador precisa aprovar
                </p>
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
                  <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                    {taskChipByStatus.APPROVED.label}
                  </span>
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
                  <CircleCheck className="size-4 shrink-0 text-emerald-500" />
                  {task.points} pts · pontos creditados
                </p>
              </CardContent>
            </Card>
          ))}
        </section>
      ) : null}
    </div>
  )
}
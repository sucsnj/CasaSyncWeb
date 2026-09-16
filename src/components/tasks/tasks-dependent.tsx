'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { completeTask } from '@/actions/tasks'
import { usePostgresChanges } from '@/hooks/use-postgres-changes'
import type { Tables } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

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
          className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-base font-medium">Suas tarefas</h2>

        {openTasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma tarefa pendente. Aproveite!
          </p>
        ) : (
          openTasks.map((task) => (
            <Card key={task.id}>
              <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{task.title}</p>
                  {task.description ? (
                    <p className="text-sm text-muted-foreground">
                      {task.description}
                    </p>
                  ) : null}
                  <p className="text-sm text-muted-foreground">
                    {task.points} pts
                    {task.due_date
                      ? ` · até ${new Date(task.due_date).toLocaleString('pt-BR')}`
                      : ''}
                  </p>
                </div>
                <Button
                  onClick={() => handleComplete(task)}
                  disabled={pending}
                  className="shrink-0"
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
          <h2 className="font-heading text-base font-medium">
            Aguardando aprovação
          </h2>
          {awaitingTasks.map((task) => (
            <Card key={task.id}>
              <CardContent>
                <p className="font-medium">{task.title}</p>
                <p className="text-sm text-muted-foreground">
                  {task.points} pts · o administrador precisa aprovar
                </p>
              </CardContent>
            </Card>
          ))}
        </section>
      ) : null}

      {doneTasks.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-base font-medium">Concluídas</h2>
          {doneTasks.map((task) => (
            <Card key={task.id}>
              <CardContent>
                <p className="font-medium">{task.title}</p>
                <p className="text-sm text-muted-foreground">
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
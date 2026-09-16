'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { approveTask, createTask, updateTask } from '@/actions/tasks'
import { usePostgresChanges } from '@/hooks/use-postgres-changes'
import type { Tables } from '@/types/database'
import { DebouncedField } from './debounced-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type Task = Tables<'tasks'>
type Assignee = { id: string; full_name: string }

function upsertTask(list: Task[], task: Task): Task[] {
  const exists = list.some((item) => item.id === task.id)
  const next = exists
    ? list.map((item) => (item.id === task.id ? task : item))
    : [task, ...list]
  return next.sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export function TasksAdmin({
  houseId,
  initialTasks,
  assignees,
}: {
  houseId: string
  initialTasks: Task[]
  assignees: Assignee[]
}) {
  const router = useRouter()
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [pending, startTransition] = useTransition()
  const [formError, setFormError] = useState<string | null>(null)

  // Sincronização em tempo real: quando o dependente conclui uma tarefa
  // (UPDATE), o payload chega aqui instantaneamente e a lista do ADMIN é
  // atualizada sem refresh manual. O inverso também vale.
  usePostgresChanges<Task>({
    table: 'tasks',
    filter: `house_id=eq.${houseId}`,
    onUpsert: (task) => setTasks((prev) => upsertTask(prev, task)),
    onDelete: (taskId) =>
      setTasks((prev) => prev.filter((task) => task.id !== taskId)),
  })

  const assigneeName = (id: string | null) =>
    assignees.find((assignee) => assignee.id === id)?.full_name ?? 'Sem nome'

  const pendingTasks = tasks.filter(
    (task) => task.status === 'PENDING' || task.status === 'IN_PROGRESS'
  )
  const completedTasks = tasks.filter((task) => task.status === 'COMPLETED')
  const approvedTasks = tasks.filter((task) => task.status === 'APPROVED')

  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    // currentTarget é nulled após o primeiro await — capturar o form agora.
    const form = event.currentTarget

    setFormError(null)
    const formData = new FormData(form)

    startTransition(async () => {
      const result = await createTask({
        title: String(formData.get('title') ?? ''),
        description: String(formData.get('description') ?? ''),
        dueDate: String(formData.get('due_date') ?? '') || null,
        points: Number(formData.get('points')),
        assignedTo: String(formData.get('assigned_to') ?? ''),
      })

      if (!result.ok) {
        setFormError(result.error)
        return
      }

      setFormError(null)
      form.reset()
      // O INSERT também chega via Realtime; o refresh é a rede de segurança.
      router.refresh()
    })
  }

  function handleApprove(task: Task) {
    startTransition(async () => {
      const result = await approveTask(task.id)
      if (!result.ok) {
        setFormError(result.error)
        return
      }

      // Otimista: reflete o APPROVED na hora (Realtime confirma/refina).
      setTasks((prev) =>
        upsertTask(prev, { ...task, status: 'APPROVED' })
      )
      router.refresh()
    })
  }

  const saveTitle = (taskId: string) => async (value: string) =>
    updateTask(taskId, { title: value })

  const saveDescription = (taskId: string) => async (value: string) =>
    updateTask(taskId, { description: value })

  const savePoints = (taskId: string) => async (value: string) => {
    const points = Number(value)
    if (!Number.isInteger(points) || points < 0) {
      return { ok: false as const, error: 'Pontos deve ser um inteiro >= 0.' }
    }
    return updateTask(taskId, { points })
  }

  const saveDueDate = (taskId: string) => async (value: string) =>
    updateTask(taskId, { due_date: value ? value : null })

  function changeAssignee(task: Task, assigneeId: string) {
    const next = assigneeId || null
    // Otimista: o select controlado reage na hora (o Realtime confirma depois).
    setTasks((prev) => upsertTask(prev, { ...task, assigned_to: next }))
    void updateTask(task.id, { assigned_to: next })
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Nova tarefa</CardTitle>
          <CardDescription>
            Atribua uma tarefa a um dependente da casa ativa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="grid gap-3 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="task-title">Título</Label>
              <Input id="task-title" name="title" required placeholder="Ex.: Arrumar o quarto" />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="task-assignee">Dependente</Label>
              <select
                id="task-assignee"
                name="assigned_to"
                required
                defaultValue=""
                className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
              >
                <option value="" disabled>
                  Selecionar...
                </option>
                {assignees.map((assignee) => (
                  <option key={assignee.id} value={assignee.id}>
                    {assignee.full_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="task-due-date">Data/hora limite</Label>
              <Input id="task-due-date" name="due_date" type="datetime-local" />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="task-points">Pontos</Label>
              <Input
                id="task-points"
                name="points"
                type="number"
                min={0}
                step={1}
                defaultValue={5}
                required
              />
            </div>

            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="task-description">Descrição</Label>
              <textarea
                id="task-description"
                name="description"
                rows={2}
                placeholder="Opcional"
                className="h-auto w-full min-w-0 resize-y rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
              />
            </div>

            {formError ? (
              <p className="text-sm text-destructive md:col-span-2" role="alert">
                {formError}
              </p>
            ) : null}

            <div className="md:col-span-2">
              <Button type="submit" disabled={pending}>
                {pending ? 'Criando...' : 'Criar tarefa'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-base font-medium">Pendentes</h2>
        {pendingTasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma tarefa pendente.
          </p>
        ) : (
          pendingTasks.map((task) => (
            <Card key={task.id}>
              <CardContent className="flex flex-col gap-3">
                <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                  <DebouncedField
                    value={task.title}
                    onSave={saveTitle(task.id)}
                    placeholder="Título da tarefa"
                  />

                  <label className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Atribuída a</span>
                    <select
                      value={task.assigned_to ?? ''}
                      onChange={(event) => changeAssignee(task, event.target.value)}
                      className="h-6 rounded-md border border-input bg-transparent px-1.5 text-xs outline-none focus-visible:border-ring"
                    >
                      <option value="">Sem atribuição</option>
                      {assignees.map((assignee) => (
                        <option key={assignee.id} value={assignee.id}>
                          {assignee.full_name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <DebouncedField
                  value={task.description ?? ''}
                  onSave={saveDescription(task.id)}
                  textarea
                  placeholder="Descrição (opcional)"
                />

                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1">
                    <span className="text-xs text-muted-foreground">Pontos</span>
                    <DebouncedField
                      value={String(task.points)}
                      onSave={savePoints(task.id)}
                      type="number"
                    />
                  </div>
                  <div className="grid gap-1">
                    <span className="text-xs text-muted-foreground">
                      Data limite
                    </span>
                    <DebouncedField
                      value={task.due_date ?? ''}
                      onSave={saveDueDate(task.id)}
                      type="datetime-local"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-base font-medium">
          Concluídas — aguardando aprovação
        </h2>
        {completedTasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma tarefa pendente de aprovação.
          </p>
        ) : (
          completedTasks.map((task) => (
            <Card key={task.id}>
              <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{task.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {assigneeName(task.assigned_to)} · {task.points} pts
                    {task.completed_at
                      ? ` · concluída em ${new Date(task.completed_at).toLocaleString('pt-BR')}`
                      : ''}
                  </p>
                </div>
                <Button onClick={() => handleApprove(task)} disabled={pending}>
                  {pending ? 'Aprovando...' : 'Aprovar e creditar pontos'}
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </section>

      {approvedTasks.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-base font-medium">Aprovadas</h2>
          {approvedTasks.map((task) => (
            <Card key={task.id}>
              <CardContent className="flex flex-col gap-1">
                <p className="font-medium">{task.title}</p>
                <p className="text-sm text-muted-foreground">
                  {assigneeName(task.assigned_to)} · {task.points} pts
                  {' · '}pontos creditados
                </p>
              </CardContent>
            </Card>
          ))}
        </section>
      ) : null}
    </div>
  )
}
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  approveTask,
  createTask,
  resolveTaskExtension,
  updateTask,
} from '@/actions/tasks'
import { usePostgresChanges } from '@/hooks/use-postgres-changes'
import { getTaskSlaStatus } from '@/utils/task-sla'
import type { Tables } from '@/types/database'
import { DebouncedField } from './debounced-field'
import { ImageUpload } from '@/components/ui/image-upload'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  CircleCheckBig,
  ClipboardList,
  Clock3,
  ListTodo,
  X,
} from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  POINTS_PILL_CLASS,
  taskAccentByStatus,
  taskChipByStatus,
  taskSlaBadge,
  taskSlaCardClass,
} from './task-styles'

type Task = Tables<'tasks'>
type Assignee = { id: string; full_name: string }

/** ISO do banco (timestamptz) → valor aceito por <input type="datetime-local">. */
function toDateTimeLocalValue(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Agora em formato aceito por <input type="datetime-local">. */
function nowDateTimeLocalValue(): string {
  const date = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

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
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [taskImageUrl, setTaskImageUrl] = useState<string | null>(null)

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
        imageUrl: String(formData.get('image_url') ?? '') || null,
      })

      if (!result.ok) {
        setFormError(result.error)
        return
      }

      setFormError(null)
      setTaskImageUrl(null)
      form.reset()
      setShowTaskForm(false)
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

  function handleResolveExtension(task: Task, approve: boolean) {
    setFormError(null)
    startTransition(async () => {
      const result = await resolveTaskExtension(task.id, approve)
      if (!result.ok) {
        setFormError(result.error)
        return
      }

      setTasks((prev) =>
        upsertTask(prev, {
          ...task,
          extension_requested: false,
          extension_reason: null,
        })
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
          <div>
            <CardTitle>Nova tarefa</CardTitle>
            <CardDescription>
              Atribua uma tarefa a um dependente da casa ativa.
            </CardDescription>
          </div>
          <CardAction>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowTaskForm((value) => !value)}
            >
              {showTaskForm ? 'Fechar' : 'Nova tarefa'}
            </Button>
          </CardAction>
        </CardHeader>
        {showTaskForm ? (
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
                className="min-h-12 w-full min-w-0 rounded-xl border border-input bg-white px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
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
              <Input
                id="task-due-date"
                name="due_date"
                type="datetime-local"
                defaultValue={nowDateTimeLocalValue()}
                suppressHydrationWarning
              />
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
                className="h-auto w-full min-w-0 resize-y rounded-xl border border-input bg-white px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
              />
            </div>

            <div className="flex flex-col gap-2 md:col-span-2">
              <Label>Imagem (opcional)</Label>
              <ImageUpload
                folder="tasks"
                ownerId={houseId}
                value={taskImageUrl}
                onChange={setTaskImageUrl}
              />
              <input type="hidden" name="image_url" value={taskImageUrl ?? ''} />
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
        ) : null}
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-slate-800">
          <ListTodo className="size-4 text-blue-600" />
          Pendentes
        </h2>
        {pendingTasks.length === 0 ? (
          <EmptyState
            icon={ListTodo}
            accent="bg-sky-100 text-sky-600"
            title="Nenhuma tarefa pendente"
            message="Tudo limpo por aqui! Crie o próximo desafio. 🎉"
          />
        ) : (
          pendingTasks.map((task) => {
            const sla = getTaskSlaStatus(task.created_at, task.due_date)
            const slaInfo = taskSlaBadge[sla]
            const cardClass =
              sla === 'normal'
                ? cn('border-l-4', taskAccentByStatus[task.status])
                : taskSlaCardClass[sla]

            return (
            <Card key={task.id} className={cardClass}>
              <CardContent className="flex flex-col gap-3 py-3">
                {task.image_url ? (
                  <img
                    src={task.image_url}
                    alt=""
                    className="h-32 w-full rounded-xl border border-slate-200 object-cover"
                  />
                ) : null}
                <div className="flex items-start justify-between gap-2">
                  <span className="flex shrink-0 items-center gap-1.5">
                    {slaInfo ? (
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
                        'shrink-0 rounded-full px-2.5 py-1 text-xs font-medium',
                        taskChipByStatus[task.status].className
                      )}
                    >
                      {taskChipByStatus[task.status].label}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold',
                      POINTS_PILL_CLASS
                    )}
                  >
                    {task.points} pts
                  </span>
                </div>

                <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                  <DebouncedField
                    value={task.title}
                    onSave={saveTitle(task.id)}
                    placeholder="Título da tarefa"
                  />

                  <label className="flex items-center gap-2 text-sm">
                    <span className="text-slate-500">Atribuída a</span>
                    <select
                      value={task.assigned_to ?? ''}
                      onChange={(event) => changeAssignee(task, event.target.value)}
                      className="min-h-12 rounded-xl border border-input bg-white px-2 text-xs outline-none focus-visible:border-ring"
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

                {task.extension_requested ? (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-blue-800">
                      <Clock3 className="size-4" />
                      Pedido de adiamento
                    </p>
                    <p className="mt-1 text-sm text-blue-700">
                      {task.extension_reason ?? 'Sem justificativa informada.'}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={pending}
                        className="min-h-9 bg-emerald-500 hover:bg-emerald-600"
                        onClick={() => handleResolveExtension(task, true)}
                      >
                        Aprovar (+3 dias)
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        className="min-h-9 text-slate-600"
                        onClick={() => handleResolveExtension(task, false)}
                      >
                        <X className="size-3.5" /> Rejeitar
                      </Button>
                    </div>
                  </div>
                ) : null}

                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1">
                    <span className="text-xs text-slate-500">Pontos</span>
                    <DebouncedField
                      value={String(task.points)}
                      onSave={savePoints(task.id)}
                      type="number"
                    />
                  </div>
                  <div className="grid gap-1">
                    <span className="text-xs text-slate-500">
                      Data limite
                    </span>
                    <DebouncedField
                      value={toDateTimeLocalValue(task.due_date)}
                      onSave={saveDueDate(task.id)}
                      type="datetime-local"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
            )
})
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-slate-800">
          <ClipboardList className="size-4 text-amber-500" />
          Concluídas — aguardando aprovação
        </h2>
        {completedTasks.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            accent="bg-amber-100 text-amber-600"
            title="Nenhuma tarefa para aprovar"
            message="Quando um dependente concluir uma tarefa, ela aparece aqui. 🎉"
          />
        ) : (
          completedTasks.map((task) => (
            <Card
              key={task.id}
              className="border-l-4 border-l-amber-400"
            >
              <CardContent className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-start gap-2">
                    <p className="font-semibold text-slate-800">{task.title}</p>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {assigneeName(task.assigned_to)} ·{' '}
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 font-semibold',
                        POINTS_PILL_CLASS
                      )}
                    >
                      {task.points} pts
                    </span>
                    {task.completed_at
                      ? ` · concluída em ${new Date(task.completed_at).toLocaleString('pt-BR')}`
                      : ''}
                  </p>
                </div>
                <Button
                  onClick={() => handleApprove(task)}
                  disabled={pending}
                  className="w-full shrink-0 bg-emerald-500 shadow-lg shadow-emerald-500/25 hover:bg-emerald-600 sm:w-auto"
                >
                  {pending ? 'Aprovando...' : 'Aprovar e creditar pontos'}
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </section>

      {approvedTasks.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-slate-800">
            <CircleCheckBig className="size-4 text-emerald-500" />
            Aprovadas
          </h2>
          {approvedTasks.map((task) => (
            <Card
              key={task.id}
              className="border-l-4 border-l-emerald-500"
            >
              <CardContent className="flex flex-col gap-1 py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-slate-800">{task.title}</p>
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                    {taskChipByStatus.APPROVED.label}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {assigneeName(task.assigned_to)} ·{' '}
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 font-semibold',
                      POINTS_PILL_CLASS
                    )}
                  >
                    {task.points} pts
                  </span>
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
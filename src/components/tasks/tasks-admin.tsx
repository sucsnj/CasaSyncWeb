'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  adminCompleteTask,
  approveTask,
  createTask,
  markTaskNotDelivered,
  rejectCompletedTask,
  resolveTaskExtension,
  restoreTask,
  updateTask,
} from '@/actions/tasks'
import { usePostgresChanges } from '@/hooks/use-postgres-changes'
import { getTaskSlaStatus } from '@/utils/task-sla'
import { getTaskCurrentPoints } from '@/utils/task-decay'
import { DEFAULT_TASK_DECAY, type TaskDecaySettings } from '@/utils/settings'
import { normalizeTaskTitle } from '@/utils/task-normalize'
import {
  datetimeLocalToIso,
  isoToDateTimeLocalValue,
  modifyDateTimeLocal,
  nowDateTimeLocalValue,
} from '@/utils/datetime-local'
import type { Tables } from '@/types/database'
import { DebouncedField } from './debounced-field'
// DESABILITADO — envio de imagem em tarefas (decisão de produto, 2026): as
// imagens de tarefa inflavam o storage e a feature foi desativada. A coluna
// `tasks.image_url` e as actions continuam intactas; imagens de tarefas
// antigas seguem sendo exibidas nos cards. Reativar = descomentar import,
// estado e bloco de formulário abaixo.
// import { ImageUpload } from '@/components/ui/image-upload'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import {
  ChevronDown,
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
  defaultDueDays = 1,
  dueSoonHours = 4,
  extensionDayOptions = [1, 3],
  taskDecay,
}: {
  houseId: string
  initialTasks: Task[]
  assignees: Assignee[]
  /** Prazo padrão de criação/restauro (dias a partir de agora) — settings.casa. */
  defaultDueDays?: number
  /** Horas restantes até o prazo que ligam o chip "Prazo próximo" — settings.casa. */
  dueSoonHours?: number
  /** Dias disponíveis nos botões de aprovação de adiamento — settings.casa. */
  extensionDayOptions?: number[]
  /** Decaimento de pontos de tarefas — settings.casa. */
  taskDecay?: TaskDecaySettings
}) {
  const decay = taskDecay ?? DEFAULT_TASK_DECAY
  const router = useRouter()
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [pending, startTransition] = useTransition()
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  // DESABILITADO — estado do upload de imagem de tarefas (ver comentário na importação).
  // const [taskImageUrl, setTaskImageUrl] = useState<string | null>(null)
  const [dueDate, setDueDate] = useState(() =>
    modifyDateTimeLocal(nowDateTimeLocalValue(), defaultDueDays)
  )
  // Campos do form de criação (controlados p/ autocomplete + soft block).
  const [title, setTitle] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [points, setPoints] = useState('5')
  const [description, setDescription] = useState('')
  // Tarefa do catálogo escolhida no autocomplete (modo "reutilizar").
  const [reuseTask, setReuseTask] = useState<Task | null>(null)
  // Confirmação explícita para criar duplicata ativa do mesmo pupilo.
  const [confirmDuplicate, setConfirmDuplicate] = useState(false)
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  // Cards colapsáveis (só ADMIN): por padrão todas as tarefas vêm recolhidas.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

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
    (task) =>
      task.status === 'PENDING' ||
      task.status === 'IN_PROGRESS' ||
      task.status === 'NOT_DELIVERED'
  )
  const completedTasks = tasks.filter((task) => task.status === 'COMPLETED')
  const approvedTasks = tasks.filter((task) => task.status === 'APPROVED')

  // Autocomplete "Você quis dizer...": título normalizado >= 3 chars, lista até
  // 3 tarefas da casa (catálogo todo) cujo título normalizado CONTÉM o digitado.
  const normalizedTitle = normalizeTaskTitle(title)
  const suggestions =
    normalizedTitle.length >= 3 && suggestionsOpen
      ? tasks
          .filter(
            (task) =>
              task.title &&
              normalizeTaskTitle(task.title).includes(normalizedTitle)
          )
          .slice(0, 3)
      : []

  // Soft block por pupilo: tarefa ATIVA (PENDING/IN_PROGRESS/NOT_DELIVERED) com
  // o MESMO título normalizado para o MESMO assigned_to. Ignora a própria tarefa
  // em modo "Reativar". Fora de um gesto de confirmação explícita.
  const ACTIVE_STATUSES: Task['status'][] = [
    'PENDING',
    'IN_PROGRESS',
    'NOT_DELIVERED',
  ]
  const duplicateActive = normalizedTitle
    ? (tasks.find(
        (task) =>
          task.id !== reuseTask?.id &&
          task.assigned_to === assignedTo &&
          ACTIVE_STATUSES.includes(task.status) &&
          task.title &&
          normalizeTaskTitle(task.title) === normalizedTitle
      ) ?? null)
    : null

  function resetForm() {
    setTitle('')
    setDescription('')
    setPoints('5')
    setAssignedTo('')
    setDueDate(modifyDateTimeLocal(nowDateTimeLocalValue(), defaultDueDays))
    setReuseTask(null)
    setConfirmDuplicate(false)
    setSuggestionsOpen(false)
  }

  function applySuggestion(task: Task) {
    // Preenche o form com TODOS os dados da tarefa do catálogo; prazo = prazo
    // padrão da casa (settings) a partir de agora (o render abaixo recalcula a
    // duplicata/Reativar conforme o novo estado).
    setTitle(task.title)
    setDescription(task.description ?? '')
    setPoints(String(task.points))
    setAssignedTo(task.assigned_to ?? '')
    setDueDate(modifyDateTimeLocal(nowDateTimeLocalValue(), defaultDueDays))
    setSuggestionsOpen(false)
    setConfirmDuplicate(false)
    // Somente tarefa aprovada entra em modo "Reativar" (botão + submit diferentes).
    setReuseTask(task.status === 'APPROVED' ? task : null)
  }

  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setFormError(null)

    // Reutilização de uma tarefa aprovada: reativa preservando os dados e
    // reiniciando o prazo (+1 dia) — equivalente ao restoreTask dos cards.
    if (reuseTask?.status === 'APPROVED') {
      startTransition(async () => {
        const result = await restoreTask(reuseTask.id)
        if (!result.ok) {
          setFormError(result.error)
          toast.error(result.error)
          return
        }

        toast.success(result.message ?? 'Tarefa reativada')
        setFormError(null)
        resetForm()
        setShowTaskForm(false)
        router.refresh()
      })
      return
    }

    // Soft block: criar uma tarefa ativa com o MESMO nome (normalizado) de uma
    // já existente para o MESMO pupilo exige confirmação explícita.
    const dup = duplicateActive
    if (dup && !confirmDuplicate) {
      setFormError(
        `Já existe uma tarefa ativa "${dup.title}" para ${assigneeName(dup.assigned_to)}. Use "Criar mesmo assim" para criar a duplicata.`
      )
      toast.warning('Duplicata detectada: confirme para criar mesmo assim.')
      return
    }

    const pointsValue = Number(points)
    if (!Number.isInteger(pointsValue) || pointsValue < 0) {
      setFormError('Pontos deve ser um inteiro >= 0.')
      toast.error('Pontos deve ser um inteiro >= 0.')
      return
    }

    startTransition(async () => {
      const result = await createTask(
        {
          title,
          description,
          dueDate: datetimeLocalToIso(dueDate),
          points: pointsValue,
          assignedTo,
          imageUrl: null,
        },
        confirmDuplicate ? { force: true } : undefined
      )

      if (!result.ok) {
        setFormError(result.error)
        toast.error(result.error)
        return
      }

      toast.success(result.message ?? 'Tarefa criada')
      setFormError(null)
      resetForm()
      setShowTaskForm(false)
      router.refresh()
    })
  }

  function handleApprove(task: Task) {
    startTransition(async () => {
      const result = await approveTask(task.id)
      if (!result.ok) {
        setFormError(result.error)
        toast.error(result.error)
        return
      }

      toast.success(result.message ?? 'Tarefa aprovada')
      // Otimista: reflete o APPROVED na hora (Realtime confirma/refina).
      setTasks((prev) =>
        upsertTask(prev, { ...task, status: 'APPROVED' })
      )
      router.refresh()
    })
  }

  function handleRejectComplete(task: Task) {
    setFormError(null)
    startTransition(async () => {
      const result = await rejectCompletedTask(task.id)
      if (!result.ok) {
        setFormError(result.error)
        toast.error(result.error)
        return
      }

      toast.success(result.message ?? 'Tarefa devolvida')
      // Otimista: devolve o card à lista de pendentes na hora.
      setTasks((prev) =>
        upsertTask(prev, {
          ...task,
          status: 'PENDING',
          completed_by: null,
          completed_at: null,
        })
      )
      router.refresh()
    })
  }

  function handleAdminComplete(task: Task) {
    setFormError(null)
    startTransition(async () => {
      const result = await adminCompleteTask(task.id)
      if (!result.ok) {
        setFormError(result.error)
        toast.error(result.error)
        return
      }

      toast.success(result.message ?? 'Tarefa concluída e creditada')
      // Otimista: reflete o APPROVED na hora (Realtime confirma/refina).
      setTasks((prev) =>
        upsertTask(prev, { ...task, status: 'APPROVED' })
      )
      router.refresh()
    })
  }

  function handleMarkNotDelivered(task: Task) {
    setFormError(null)
    startTransition(async () => {
      const result = await markTaskNotDelivered(task.id)
      if (!result.ok) {
        setFormError(result.error)
        toast.error(result.error)
        return
      }

      toast.warning(result.message ?? 'Tarefa marcada como não entregue')
      // Otimista: o card passa a exibir o estado "não entregue" na hora.
      setTasks((prev) =>
        upsertTask(prev, { ...task, status: 'NOT_DELIVERED' })
      )
      router.refresh()
    })
  }

  function handleRestore(task: Task) {
    setFormError(null)
    startTransition(async () => {
      const result = await restoreTask(task.id)
      if (!result.ok) {
        setFormError(result.error)
        toast.error(result.error)
        return
      }

      toast.success(result.message ?? 'Tarefa restaurada')
      // Otimista: volta para Pendentes com o prazo reiniciado (prazo padrão da
      // casa). Os pontos já creditados são mantidos e a tarefa reaparece para
      // o dependente.
      const nextDue = new Date(
        Date.now() + defaultDueDays * 24 * 60 * 60 * 1000
      ).toISOString()
      setTasks((prev) =>
        upsertTask(prev, {
          ...task,
          status: 'PENDING',
          due_date: nextDue,
          completed_by: null,
          completed_at: null,
          extension_requested: false,
          extension_reason: null,
        })
      )
      router.refresh()
    })
  }

  function handleResolveExtension(task: Task, approve: boolean, days = 3) {
    setFormError(null)
    startTransition(async () => {
      const result = await resolveTaskExtension(task.id, approve, days)
      if (!result.ok) {
        setFormError(result.error)
        toast.error(result.error)
        return
      }

      if (approve) {
        toast.success(result.message ?? `Adiamento aprovado (+${days} dias)`)
      } else {
        toast.info('Pedido de adiamento rejeitado')
      }

      // Otimista: limpa o pedido. Numa tarefa "não entregue", aprovar também
      // devolve os pontos: zera a tarefa e reabre conforme o novo prazo.
      const restored =
        approve && task.status === 'NOT_DELIVERED'
          ? { points: 0, status: 'PENDING' as Task['status'] }
          : {}

      setTasks((prev) =>
        upsertTask(prev, {
          ...task,
          extension_requested: false,
          extension_reason: null,
          ...restored,
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

  const saveDueDate = (taskId: string) => async (value: string) => {
    // O valor do `datetime-local` é a hora local (sem fuso) — converte para o
    // instante UTC antes de gravar; a action rejeita prazo sem fuso.
    const nextDue = datetimeLocalToIso(value)
    if (value && !nextDue) {
      return { ok: false as const, error: 'Prazo inválido.' }
    }

    const result = await updateTask(taskId, {
      due_date: nextDue,
    })
    if (!result.ok) return result

    // Atualização determinística do card local: o auto-aceite do adiamento por
    // edição de prazo limpa as flags no banco; refletir aqui sem depender do
    // eco do Realtime. Só limpa se houver pedido pendente E o instante mudou.
    // Numa tarefa "não entregue", mudar o prazo devolve os pontos: zera a
    // tarefa e reabre conforme o novo prazo.
    setTasks((prev) =>
      prev.map((item) => {
        if (item.id !== taskId) return item
        const changed =
          (item.due_date ? new Date(item.due_date).getTime() : null) !==
          (nextDue ? new Date(nextDue).getTime() : null)
        const cleared =
          item.extension_requested && changed
            ? { extension_requested: false, extension_reason: null }
            : {}
        const restored =
          item.status === 'NOT_DELIVERED' && changed
            ? {
              points: 0,
              status: (nextDue && new Date(nextDue).getTime() < Date.now()
                ? 'NOT_DELIVERED'
                : 'PENDING') as Task['status'],
            }
            : {}
        return { ...item, due_date: nextDue, ...cleared, ...restored }
      })
    )
    router.refresh()
    return result
  }

  function changeAssignee(task: Task, assigneeId: string) {
    const next = assigneeId || null
    // Otimista: o select controlado reage na hora (o Realtime confirma depois).
    setTasks((prev) => upsertTask(prev, { ...task, assigned_to: next }))
    void updateTask(task.id, { assigned_to: next })
  }

  function toggleExpanded(taskId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(taskId)) {
        next.delete(taskId)
      } else {
        next.add(taskId)
      }
      return next
    })
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
            <form
              onSubmit={handleCreate}
              className="grid gap-3 md:grid-cols-2 md:items-start"
            >
              <div className="relative grid gap-2">
                <Label htmlFor="task-title">Título</Label>
                <Input
                  id="task-title"
                  name="title"
                  required
                  value={title}
                  onChange={(event) => {
                    setTitle(event.target.value)
                    setSuggestionsOpen(true)
                    // Editar o título manualmente sai do modo "reutilizar".
                    setReuseTask(null)
                    setConfirmDuplicate(false)
                  }}
                  placeholder="Ex.: Arrumar o quarto"
                />

                {/* Autocomplete "Você quis dizer..." — catálogo da casa toda,
                    título normalizado >= 3 chars, até 3 sugestões. */}
                {suggestions.length > 0 ? (
                  <ul className="absolute top-full left-0 z-20 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                    {suggestions.map((suggestion) => (
                      <li key={suggestion.id}>
                        <button
                          type="button"
                          onClick={() => applySuggestion(suggestion)}
                          className="flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors hover:bg-slate-50"
                        >
                          <span className="truncate text-sm font-medium text-slate-800">
                            {suggestion.title}
                          </span>
                          <span className="flex items-center gap-1.5 text-xs text-slate-500">
                            <span
                              className={cn(
                                'rounded-full px-2 py-0.5 font-medium',
                                taskChipByStatus[suggestion.status].className
                              )}
                            >
                              {taskChipByStatus[suggestion.status].label}
                            </span>
                            {assigneeName(suggestion.assigned_to) ? (
                              <span>· {assigneeName(suggestion.assigned_to)}</span>
                            ) : null}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="task-assignee">Dependente</Label>
                <select
                  id="task-assignee"
                  name="assigned_to"
                  required
                  value={assignedTo}
                  onChange={(event) => {
                    setAssignedTo(event.target.value)
                    setConfirmDuplicate(false)
                  }}
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
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                  suppressHydrationWarning
                />
                <div className="flex gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => setDueDate((value) => modifyDateTimeLocal(value, 1))}
                  >
                    +1 Dia
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => setDueDate((value) => modifyDateTimeLocal(value, 0, 2))}
                  >
                    +2h
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => setDueDate(nowDateTimeLocalValue())}
                  >
                    Limpar
                  </Button>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="task-points">Pontos</Label>
                <Input
                  id="task-points"
                  name="points"
                  type="number"
                  min={0}
                  step={1}
                  value={points}
                  onChange={(event) => setPoints(event.target.value)}
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
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="h-auto w-full min-w-0 resize-y rounded-xl border border-input bg-white px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
                />
              </div>

              {/*
              Bloco DESATIVADO — upload de imagem da tarefa (decisão de produto, 2026):
              envio de imagens em tarefas foi desligado para NÃO INFLAR o
              storage/banco. Com o campo oculto (`image_url`) removido, o
              `formData.get('image_url')` volta null e a tarefa nasce sem imagem.
              A coluna `tasks.image_url` segue no schema e imagens de tarefas
              antigas continuam aparecendo nos cards. Reativar = descomentar.
            */}
              {/* <div className="flex flex-col gap-2 md:col-span-2">
              <Label>Imagem (opcional)</Label>
              <ImageUpload
                folder="tasks"
                ownerId={houseId}
                value={taskImageUrl}
                onChange={setTaskImageUrl}
              />
              <input type="hidden" name="image_url" value={taskImageUrl ?? ''} />
            </div> */}

              {formError ? (
                <p className="text-sm text-destructive md:col-span-2" role="alert">
                  {formError}
                </p>
              ) : null}

              {duplicateActive && !confirmDuplicate ? (
                <div
                  className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 md:col-span-2"
                  role="alert"
                >
                  <p className="text-sm font-medium text-amber-800">
                    Já existe uma tarefa ativa &quot;{duplicateActive.title}&quot; para{' '}
                    {assigneeName(duplicateActive.assigned_to)}.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-9 border-amber-300 text-amber-700 hover:bg-amber-100"
                      onClick={() => applySuggestion(duplicateActive)}
                      disabled={pending}
                    >
                      Usar existente
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="min-h-9 bg-amber-500 hover:bg-amber-600"
                      onClick={() => setConfirmDuplicate(true)}
                      disabled={pending}
                    >
                      Criar mesmo assim
                    </Button>
                  </div>
                </div>
              ) : null}

              {reuseTask ? (
                <p
                  className="text-sm text-sky-700 md:col-span-2"
                  role="status"
                >
                  Reutilizando &quot;{reuseTask.title}&quot;: os dados foram copiados e o
                  prazo reiniciado (+1 dia). Confirme para reativar a tarefa
                  existente.
                </p>
              ) : null}

              <div className="md:col-span-2">
                <Button type="submit" disabled={pending}>
                  {pending
                    ? reuseTask
                      ? 'Reativando...'
                      : 'Criando...'
                    : reuseTask
                      ? 'Reativar tarefa existente'
                      : 'Criar tarefa'}
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
            const sla = getTaskSlaStatus(
              task.due_date,
              new Date(),
              dueSoonHours
            )
            const slaInfo = taskSlaBadge[sla]
            const cardClass =
              sla === 'normal'
                ? cn('border-l-4', taskAccentByStatus[task.status])
                : taskSlaCardClass[sla]
            const isExpanded = expandedIds.has(task.id)
            const isNotDelivered = task.status === 'NOT_DELIVERED'
            // Valor corrente sob o decaimento (base − perdas até agora/prazo).
            const currentPoints = getTaskCurrentPoints(
              task.points,
              task.created_at,
              task.due_date,
              decay
            )

            return (
              <Card key={task.id} className={cardClass}>
                <CardContent className="flex flex-col gap-3 py-3">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(task.id)}
                    aria-expanded={isExpanded}
                    className="flex w-full flex-wrap items-center gap-2 text-left"
                  >
                    <span className="min-w-0 basis-full truncate font-medium text-slate-800 sm:basis-0 sm:flex-1">
                      {task.title}
                    </span>
                    <span className="flex shrink-0 flex-wrap items-center gap-1.5">
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
                    <ChevronDown
                      className={cn(
                        'size-4 shrink-0 text-slate-400 transition-transform duration-200',
                        isExpanded && 'rotate-180'
                      )}
                    />
                  </button>

                  {isExpanded ? (
                    <>
                      {/* Imagem só de tarefas antigas — upload desabilitado (não inflar storage). */}
                      {task.image_url ? (
                        <img
                          src={task.image_url}
                          alt=""
                          className="h-32 w-full rounded-xl border border-slate-200 object-cover"
                        />
                      ) : null}

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
                          {isNotDelivered ? (
                            <p className="mt-1 text-xs text-blue-700">
                              Aprovar devolve os pontos debitados e a tarefa passa a
                              valer 0.
                            </p>
                          ) : null}
                          <div className="mt-2 flex flex-wrap gap-2">
                            {extensionDayOptions.map((days) => (
                              <Button
                                key={days}
                                type="button"
                                size="sm"
                                disabled={pending}
                                className="min-h-9 bg-emerald-500 hover:bg-emerald-600"
                                onClick={() => handleResolveExtension(task, true, days)}
                              >
                                Aprovar (+{days} {days === 1 ? 'dia' : 'dias'})
                              </Button>
                            ))}
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

                      <div
                        className={cn(
                          'grid gap-3',
                          isNotDelivered ? 'grid-cols-1' : 'grid-cols-2'
                        )}
                      >
                        {!isNotDelivered ? (
                          <div className="grid gap-1">
                            <span className="text-xs text-slate-500">Pontos</span>
                            <DebouncedField
                              value={String(task.points)}
                              onSave={savePoints(task.id)}
                              type="number"
                            />
                          </div>
                        ) : null}
                        <div className="grid gap-1">
                          <span className="text-xs text-slate-500">
                            Data limite
                          </span>
                          <DebouncedField
                            value={isoToDateTimeLocalValue(task.due_date)}
                            onSave={saveDueDate(task.id)}
                            type="datetime-local"
                          />
                        </div>
                      </div>

                      {isNotDelivered ? (
                        <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                          Tarefa marcada como não entregue — {currentPoints} pt(s) já
                          debitado(s) do dependente. Aprovar um adiamento (ou
                          alterar o prazo) devolve os pontos e zera a tarefa.
                        </p>
                      ) : (
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Button
                            type="button"
                            onClick={() => handleAdminComplete(task)}
                            disabled={pending}
                            className="w-full bg-emerald-500 shadow-lg shadow-emerald-500/25 hover:bg-emerald-600 sm:flex-1"
                          >
                            {pending
                              ? 'Concluindo...'
                              : 'Concluir e creditar pontos'}
                          </Button>
                          {sla === 'overdue' ? (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => handleMarkNotDelivered(task)}
                              disabled={pending}
                              className="w-full border-red-200 text-red-700 hover:bg-red-50 sm:flex-1"
                            >
                              Marcar como não entregue
                            </Button>
                          ) : null}
                        </div>
                      )}
                    </>
                  ) : null}
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
          completedTasks.map((task) => {
            const isExpanded = expandedIds.has(task.id)
            // Valor corrente sob o decaimento (o que será creditado na aprovação).
            const currentPoints = getTaskCurrentPoints(
              task.points,
              task.created_at,
              task.due_date,
              decay
            )

            return (
              <Card
                key={task.id}
                className="border-l-4 border-l-amber-400"
              >
                <CardContent className="flex flex-col gap-2 py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      onClick={() => toggleExpanded(task.id)}
                      aria-expanded={isExpanded}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <span className="min-w-0 flex-1 truncate font-semibold text-slate-800">
                        {task.title}
                      </span>
                      <ChevronDown
                        className={cn(
                          'size-4 shrink-0 text-slate-400 transition-transform duration-200',
                          isExpanded && 'rotate-180'
                        )}
                      />
                    </button>
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                        {taskChipByStatus.COMPLETED.label}
                      </span>
                      <Button
                        variant="outline"
                        onClick={() => handleRejectComplete(task)}
                        disabled={pending}
                        className="min-h-9 shrink-0 text-slate-600"
                      >
                        Desaprovar
                      </Button>
                      <Button
                        onClick={() => handleApprove(task)}
                        disabled={pending}
                        className="min-h-9 shrink-0 bg-emerald-500 shadow-lg shadow-emerald-500/25 hover:bg-emerald-600"
                      >
                        {pending ? (
                          'Aprovando...'
                        ) : (
                          <>
                            <span className="hidden sm:inline">
                              Aprovar e creditar pontos
                            </span>
                            <span className="sm:hidden">Aprovar</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {isExpanded ? (
                    <>
                      {task.description ? (
                        <p className="text-sm text-slate-500">{task.description}</p>
                      ) : null}
                      <p className="text-sm text-slate-500">
                        {assigneeName(task.assigned_to)} ·{' '}
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 font-semibold',
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
                        {task.completed_at
                          ? ` · concluída em ${new Date(task.completed_at).toLocaleString('pt-BR')}`
                          : ''}
                      </p>
                    </>
                  ) : null}
                </CardContent>
              </Card>
            )
          })
        )}
      </section>

      {approvedTasks.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-slate-800">
            <CircleCheckBig className="size-4 text-emerald-500" />
            Aprovadas
          </h2>
          {approvedTasks.map((task) => {
            const isExpanded = expandedIds.has(task.id)

            return (
              <Card
                key={task.id}
                className="border-l-4 border-l-emerald-500"
              >
                <CardContent className="flex flex-col gap-1 py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      onClick={() => toggleExpanded(task.id)}
                      aria-expanded={isExpanded}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <span className="min-w-0 flex-1 truncate font-semibold text-slate-800">
                        {task.title}
                      </span>
                      <ChevronDown
                        className={cn(
                          'size-4 shrink-0 text-slate-400 transition-transform duration-200',
                          isExpanded && 'rotate-180'
                        )}
                      />
                    </button>
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                        {taskChipByStatus.APPROVED.label}
                      </span>
                      <Button
                        variant="outline"
                        onClick={() => handleRestore(task)}
                        disabled={pending}
                        className="min-h-9 shrink-0 text-slate-600"
                      >
                        Restaurar
                      </Button>
                    </div>
                  </div>
                  {isExpanded ? (
                    <>
                      {task.description ? (
                        <p className="mt-1 text-sm text-slate-500">{task.description}</p>
                      ) : null}
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
                    </>
                  ) : null}
                </CardContent>
              </Card>
            )
          })}
        </section>
      ) : null}
    </div>
  )
}
'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CircleCheck, ChevronDown, Clock3, ListTodo, Sparkles, UserRound } from 'lucide-react'
import { completeTask, requestTaskExtension } from '@/actions/tasks'
import { usePostgresChanges } from '@/hooks/use-postgres-changes'
import { getTaskSlaStatus } from '@/utils/task-sla'
import { getTaskCurrentPoints, getTaskDecayStart } from '@/utils/task-decay'
import { DEFAULT_TASK_DECAY, type TaskDecaySettings } from '@/utils/settings'
import type { Tables } from '@/types/database'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { CardColumns } from '@/components/ui/card-columns'
import { EmptyState } from '@/components/ui/empty-state'
import { FormattedDateTime } from '@/components/ui/formatted-date'
import { Modal } from '@/components/ui/modal'
import {
  POINTS_PILL_CLASS,
  taskAccentByStatus,
  taskChipByStatus,
  taskExtensionChip,
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
  dueSoonHours = 4,
  taskDecay,
}: {
  houseId: string
  initialTasks: Task[]
  creatorNames: Record<string, string>
  /** Horas restantes até o prazo que ligam o chip "Prazo próximo" — settings.casa. */
  dueSoonHours?: number
  /** Decaimento de pontos de tarefas — settings.casa. */
  taskDecay?: TaskDecaySettings
}) {
  const decay = taskDecay ?? DEFAULT_TASK_DECAY
  const router = useRouter()
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [error, setError] = useState<string | null>(null)
  const [extendingTask, setExtendingTask] = useState<Task | null>(null)
  const [extensionError, setExtensionError] = useState<string | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  // Ids das tarefas com uma transição em andamento (concluir / pedir mais
  // tempo). NÃO usa `pending` do `useTransition`: `startTransition(async …)`
  // nunca marca `isPending` — o React não rastreia a Promise devolvida pelo
  // callback — então o label "Enviando..." e o `disabled` ficavam
  // permanentemente falsos e o botão parecia travado durante todo o trabalho
  // do servidor.
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  // O pedido de adiamento sai de um Modal de instância única (não de um card
  // repetido), então um flag próprio é mais simples que o Set — e não sofre com
  // o `setExtendingTask(null)` do sucesso, que desmonta o botão.
  const [sendingExtension, setSendingExtension] = useState(false)

  function setPendingId(id: string, on: boolean) {
    setPendingIds((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  /**
   * Ids cujo card está num valor que **só o otimista produziu**. Ref (e não
   * state) porque o efeito de sincronização da prop precisa ler sem se
   * reinscrever — ver `rollbackOptimistic`.
   */
  const optimisticIdsRef = useRef<Set<string>>(new Set())

  function setOptimistic(id: string, on: boolean) {
    if (on) optimisticIdsRef.current.add(id)
    else optimisticIdsRef.current.delete(id)
  }

  /**
   * Desfaz o update otimista **só se o card ainda estiver num valor produzido
   * pelo otimista** — se uma linha real chegou no meio do `await`, o id já saiu
   * do registro e o dado novo (mais recente que o `task` capturado no render) é
   * preservado em vez de sobrescrito.
   *
   * Registro e não predicado (`item.status === 'COMPLETED'`): o predicado seria
   * indistinguível da linha que um escritor concorrente produziu (ver
   * `rollbackOptimistic` em `tasks-admin.tsx`).
   */
  function rollbackOptimistic(task: Task) {
    if (!optimisticIdsRef.current.has(task.id)) return
    setTasks((prev) => upsertTask(prev, task))
  }

  /**
   * Sincroniza a lista com a prop do servidor. Sem isso o `router.refresh()`
   * não fazia nada: o componente é montado com `key={casa.id}`, que só muda na
   * troca de casa, então o `useState(initialTasks)` de um client component já
   * montado ignora a prop nova. Pulado enquanto há valor otimista na tela (o
   * refresh traria o estado anterior do servidor e sobrescreveria o card).
   */
  useEffect(() => {
    if (optimisticIdsRef.current.size > 0) return
    setTasks(initialTasks)
  }, [initialTasks])

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

  // ENSINO (teach): o evento de UPDATE é recebido ao vivo. Quando o ADMIN
  // aprova (APPROVED) a lista muda na hora; quando o ADMIN cria (INSERT) uma
  // nova tarefa para este dependente, ela aparece sem refresh. O RLS do lado
  // do servidor garante que só cheguem tarefas às quais este usuário tem
  // acesso de leitura — embora o filter seja por casa.
  usePostgresChanges<Task>({
    table: 'tasks',
    filter: `house_id=eq.${houseId}`,
    onUpsert: (task) => {
      // Chegou linha REAL do servidor → sai do registro de otimistas.
      setOptimistic(task.id, false)
      setTasks((prev) => upsertTask(prev, task))
    },
    onDelete: (taskId) =>
      setTasks((prev) => prev.filter((task) => task.id !== taskId)),
  })

  function handleComplete(task: Task) {
    if (pendingIds.has(task.id)) return
    setError(null)
    setPendingId(task.id, true)
    setOptimistic(task.id, true)
    // Otimista ANTES do `await`: o card muda de seção na hora. O `completed_at`
    // é aproximado (o valor exato é o do servidor) e o Realtime/refresh corrige.
    const optimistic: Task = {
      ...task,
      status: 'COMPLETED',
      completed_at: new Date().toISOString(),
    }
    setTasks((prev) => upsertTask(prev, optimistic))

    void (async () => {
      try {
        const result = await completeTask(task.id)
        if (!result.ok) {
          rollbackOptimistic(task)
          setError(result.error)
          toast.error(result.error)
          return
        }

        toast.success('Tarefa concluída! Aguardando aprovação.')
        router.refresh()
      } catch {
        const msg = 'Falha de conexão. Tente novamente.'
        rollbackOptimistic(task)
        // Erro de rede é ambíguo: o servidor pode ter gravado e só a resposta
        // não ter chegado. O `refresh` traz a linha real de volta (ver o efeito
        // de sincronização da prop) e o Realtime confirma.
        router.refresh()
        setError(msg)
        toast.error(msg)
      } finally {
        setPendingId(task.id, false)
        setOptimistic(task.id, false)
      }
    })()
  }

  function handleRequestExtension(task: Task, form: HTMLFormElement) {
    if (sendingExtension) return
    setExtensionError(null)
    const data = new FormData(form)
    const reason = String(data.get('extensionReason') ?? '')
    form.reset()
    setSendingExtension(true)
    setOptimistic(task.id, true)
    // Otimista: o banner "Pedido de adiamento" e a somatória aparecem na hora,
    // e o botão "Pedir mais tempo" some (o card já não tem `due_date` livre).
    setTasks((prev) =>
      upsertTask(prev, {
        ...task,
        extension_requested: true,
        extension_reason: reason,
      })
    )

    void (async () => {
      try {
        const result = await requestTaskExtension(task.id, reason)
        if (!result.ok) {
          rollbackOptimistic(task)
          setExtensionError(result.error)
          toast.error(result.error)
          return
        }
        toast.success('Pedido de adiamento enviado!')
        setExtendingTask(null)
        router.refresh()
      } catch {
        const msg = 'Falha de conexão. Tente novamente.'
        rollbackOptimistic(task)
        router.refresh()
        setExtensionError(msg)
        toast.error(msg)
      } finally {
        setSendingExtension(false)
        setOptimistic(task.id, false)
      }
    })()
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
                      {/* Imagem só de tarefas antigas — upload desabilitado (não inflar storage). */}
                      {task.image_url ? (
                        <img
                          src={task.image_url}
                          alt=""
                          className="mb-3 h-32 w-full rounded-xl border border-slate-200 object-cover"
                        />
                      ) : null}
                      <p className="font-semibold text-slate-800">{task.title}</p>
                      {task.description ? (
                        <p className="mt-1 text-sm text-slate-500">
                          {task.description}
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
                          disabled={pendingIds.has(task.id)}
                          className="w-full bg-emerald-500 shadow-lg shadow-emerald-500/25 hover:bg-emerald-600 sm:w-auto"
                        >
                          {pendingIds.has(task.id)
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
                            'size-4 shrink-0 text-slate-400 transition-transform duration-200',
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
                      <p className="mt-1 text-sm text-slate-500">{task.description}</p>
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
          <h2 className="font-heading text-base font-semibold text-slate-800">
            Concluídas
          </h2>
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
                            'size-4 shrink-0 text-slate-400 transition-transform duration-200',
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
                      <p className="mt-1 text-sm text-slate-500">{task.description}</p>
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
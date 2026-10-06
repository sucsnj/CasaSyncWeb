'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  adminCompleteTask,
  approveTask,
  createTask,
  markTaskNotDelivered,
  rejectCompletedTask,
  resolveTaskExtension,
  restoreTask,
  setTaskOnHold,
  updateTask,
} from '@/actions/tasks'
import { usePostgresChanges } from '@/hooks/use-postgres-changes'
import { getTaskSlaStatus } from '@/utils/task-sla'
import { getTaskCurrentPoints, getTaskDecayStart } from '@/utils/task-decay'
import { DEFAULT_TASK_DECAY, type TaskDecaySettings } from '@/utils/settings'
import { normalizeTaskTitle, searchTasksByWords } from '@/utils/task-normalize'
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
import { ClearableInput } from '@/components/ui/clearable-input'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import {
  ChevronDown,
  CircleCheckBig,
  ClipboardList,
  Clock3,
  ListTodo,
  PauseCircle,
  PlayCircle,
  X,
} from 'lucide-react'
import { CardColumns } from '@/components/ui/card-columns'
import { EmptyState } from '@/components/ui/empty-state'
import { FormattedDateTime } from '@/components/ui/formatted-date'
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
  maxExtensions = 0,
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
  /** Máximo de adiamentos por tarefa (0 = ilimitado) — settings.casa. */
  maxExtensions?: number
  /** Decaimento de pontos de tarefas — settings.casa. */
  taskDecay?: TaskDecaySettings
}) {
  const decay = taskDecay ?? DEFAULT_TASK_DECAY
  const router = useRouter()
  // Casas com um único dependente: ele é sempre pré-selecionado na criação.
  const defaultAssignee = assignees.length === 1 ? assignees[0].id : ''
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
  const [assignedTo, setAssignedTo] = useState(defaultAssignee)
  const [points, setPoints] = useState('5')
  const [description, setDescription] = useState('')
  // Tarefa do catálogo escolhida no autocomplete (modo "reutilizar").
  const [reuseTask, setReuseTask] = useState<Task | null>(null)
  // Confirmação explícita para criar duplicata ativa do mesmo pupilo.
  const [confirmDuplicate, setConfirmDuplicate] = useState(false)
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  // Cards colapsáveis (só ADMIN): por padrão todas as tarefas vêm recolhidas.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  // Estado para rastrear status de salvamento de cada card.
  const [savingStatuses, setSavingStatuses] = useState<Record<string, 'idle' | 'saving' | 'saved'>>({});

  // Ids das tarefas com uma transição de status em andamento (aprovar, concluir,
  // desaprovar, marcar não entregue, pausar/reativar, restaurar, resolver
  // adiamento). NÃO usa o `pending` do `useTransition`: `startTransition(async …)`
  // nunca marca `isPending` — o React não rastreia a Promise devolvida pelo
  // callback — então os labels ("Aprovando…") e o `disabled` ficavam
  // permanentemente falsos e o botão parecia travado durante todo o trabalho do
  // servidor. Um Set (e não um lock de tela) porque o ADMIN pode agir em vários
  // cards ao mesmo tempo; cada card trava só o próprio botão.
  //
  // `pending` continua existindo (declarado acima) para os 3 botões do FORMULÁRIO
  // de criação, onde a ação é de escopo único e o `startTransition` faz sentido.
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())

  function setPendingId(id: string, on: boolean) {
    setPendingIds((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  /**
   * Ids cujo card está num valor que **só o otimista produziu** (ainda sem
   * resposta do servidor). Vive numa ref porque dois pontos precisam ler sem se
   * reinscrever: o rollback e a sincronização da prop.
   */
  const optimisticIdsRef = useRef<Set<string>>(new Set())

  function setOptimistic(id: string, on: boolean) {
    if (on) optimisticIdsRef.current.add(id)
    else optimisticIdsRef.current.delete(id)
  }

  /**
   * Desfaz o update otimista **só se o card ainda estiver num valor produzido
   * pelo otimista** — isto é, se nenhuma linha real chegou no meio do `await`.
   *
   * Por que um registro e não um predicado (`item.status === 'APPROVED'`): o
   * predicado é indistinguível da linha que um **escritor concorrente** produziu.
   * Numa colisão — que é exatamente o caso para onde os guards de transição
   * existem — o outro escritor grava o MESMO valor, o Realtime entrega, o
   * predicado casa e o rollback aplica o `task` capturado no render (stale) por
   * cima, pondo o card numa seção que não existe mais no banco. Com o registro, o
   * id já saiu do Set quando a linha real chegou e o dado novo é preservado.
   */
  function rollbackOptimistic(task: Task) {
    if (!optimisticIdsRef.current.has(task.id)) return
    setTasks((prev) => upsertTask(prev, task))
  }

type TransitionResult =
    | { ok: true; message?: string }
    | { ok: false; error: string }

/**
 * Executa uma transição de status com **feedback imediato**:
 * 1. trava o botão da tarefa (id no Set) → label "…" + `disabled`;
 * 2. aplica o OTIMISTA **antes** do `await` → o card muda de seção no mesmo
 *    quadro, sem esperar o servidor;
 * 3. aguarda a action;
 * 4. em erro, reverte — mas só o que ainda for o valor do otimista (ver
 *    `rollbackOptimistic`), preservando dado novo do Realtime;
 * 5. destrava no `finally`.
 *
 * Unifica os 7 handlers de transição (aprovar, concluir e creditar, desaprovar,
 * não entregue, pausa/reativação, restaurar, resolver adiamento) — o ponto de
 * elas é idêntico; o que muda é o otimista, o predicado de rollback e a action.
 */
async function runTaskTransition(
    task: Task,
    buildOptimistic: () => Task,
    run: () => Promise<TransitionResult>,
    options?: {
      successToast?: 'success' | 'warning' | 'info'
      fallbackMessage?: string
    }
  ) {
    if (pendingIds.has(task.id)) return
    // NÃO mexe em `formError`: esse state é renderizado dentro do FORM DE
    // CRIAÇÃO (que nasce colapsado), então usá-lo para uma transição de card
    // tinha dois efeitos ruins — o erro nunca aparecia ali, e o `setFormError(null)`
    // de início apagava um erro do form que ainda era válido. O erro da transição
    // sai pelo `toast.error`, que é o canal visível perto do card.
    setPendingId(task.id, true)
    setOptimistic(task.id, true)
    // A factory é avaliada AQUI (no clique), nunca durante o render: o
    // otimista de pausa/restauração calcula um prazo novo com `Date.now()`, o
    // que a regra de pureza do React proíbe em tempo de render.
    const optimistic = buildOptimistic()
    setTasks((prev) => upsertTask(prev, optimistic))

    try {
      const result = await run()
      if (!result.ok) {
        rollbackOptimistic(task)
        toast.error(result.error)
        return
      }
      const message = result.message ?? options?.fallbackMessage ?? ''
      if (options?.successToast === 'warning') toast.warning(message)
      else if (options?.successToast === 'info') toast.info(message)
      else toast.success(message)
      router.refresh()
    } catch {
      // Erro de rede é ambíguo: pode ser que o servidor tenha gravado e só a
      // resposta não chegou. O `refresh` traz a linha real de volta (ver o
      // efeito de sincronização da prop) e o Realtime confirma.
      rollbackOptimistic(task)
      router.refresh()
      toast.error('Falha de conexão. Tente novamente.')
    } finally {
      setPendingId(task.id, false)
      // A transição terminou (sucesso ou erro): o card passa a exibir o estado do
      // servidor, então sai do registro de otimistas. Fazer aqui garante que o
      // rollback já rodou ANTES desta limpeza (branches mutuamente exclusivos).
      setOptimistic(task.id, false)
    }
  }

  // Sincronização em tempo real: quando o dependente conclui uma tarefa
  // (UPDATE), o payload chega aqui instantaneamente e a lista do ADMIN é
  // atualizada sem refresh manual. O inverso também vale.
  usePostgresChanges<Task>({
    table: 'tasks',
    filter: `house_id=eq.${houseId}`,
    onUpsert: (task) => {
      // Chegou linha REAL do servidor: o card não está mais num valor que só o
      // otimista produziu, então sai do registro (ver `rollbackOptimistic`).
      setOptimistic(task.id, false)
      setTasks((prev) => upsertTask(prev, task))
    },
    onDelete: (taskId) =>
      setTasks((prev) => prev.filter((task) => task.id !== taskId)),
  })

  /**
   * Sincroniza a lista com a prop do servidor.
   *
   * Sem isso o `router.refresh()` **não** fazia nada: o componente é montado com
   * `key={casa.id}`, que só muda quando o ADMIN troca de casa — na mesma casa o
   * refresh re-renderiza o Server Component, mas o `useState(initialTasks)` de um
   * client component já montado **ignora** a prop nova. Era por isso que o
   * `refresh` do caminho de erro de rede não reconcilia nada.
   *
   * Pulado enquanto há valor otimista na tela: nesse instante o refresh traz o
   * estado ANTERIOR do servidor e sobrescreveria o card que acabou de mudar. Como
   * o `finally` de `runTaskTransition` limpa o registro antes, o refresh
   * pós-erro já entra aqui.
   */
  useEffect(() => {
    if (optimisticIdsRef.current.size > 0) return
    setTasks(initialTasks)
  }, [initialTasks])

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
  // "Em espera" (ON_HOLD): pausada pelo ADMIN, invisível para o dependente.
  const heldTasks = tasks.filter((task) => task.status === 'ON_HOLD')

  // Autocomplete "Você quis dizer...": combinação de palavras do catálogo todo
  // da casa, independente da ordem, aceitando trechos (inclusive de 1
  // caractere: "q" → "quarto") — até 3 sugestões, melhor combinação primeiro
  // (ver `searchTasksByWords`). Roda em memória (o catálogo já está no estado) —
  // uma consulta ao banco por tecla só adicionaria latência.
  const suggestions = useMemo(
    () =>
      suggestionsOpen
        ? searchTasksByWords(title, tasks, (task) => task.title, 3)
        : [],
    [suggestionsOpen, title, tasks]
  )

  // Soft block por pupilo: tarefa ATIVA (PENDING/IN_PROGRESS/NOT_DELIVERED) com
  // o MESMO título normalizado para o MESMO assigned_to. Ignora a própria tarefa
  // em modo "Reativar". Fora de um gesto de confirmação explícita.
  const normalizedTitle = normalizeTaskTitle(title)
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
    setAssignedTo(defaultAssignee)
    setDueDate(modifyDateTimeLocal(nowDateTimeLocalValue(), defaultDueDays))
    setReuseTask(null)
    setConfirmDuplicate(false)
    setSuggestionsOpen(false)
    // Erro do form pertence ao form: some junto com ele (aqui ou no próximo
    // submit), em vez de depender de alguma ação de card — que nunca teve nada
    // a ver com esta tela.
    setFormError(null)
  }

  function applySuggestion(task: Task) {
    // Preenche o form com TODOS os dados da tarefa do catálogo; prazo = prazo
    // padrão da casa (settings) a partir de agora (o render abaixo recalcula a
    // duplicata/Reativar conforme o novo estado).
    setTitle(task.title)
    setDescription(task.description ?? '')
    setPoints(String(task.points))
    setAssignedTo(task.assigned_to ?? defaultAssignee)
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
        // Otimista: reabre o card na seção de pendentes na hora, mesmo que o
        // router.refresh() ou o Realtime estejam atrasados/indisponíveis.
        if (result.data?.task) {
          setTasks((prev) => upsertTask(prev, result.data!.task))
        }
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
      // Otimista: exibe a nova tarefa na seção de pendentes na hora, mesmo que
      // o router.refresh() ou o Realtime estejam atrasados/indisponíveis.
      // Se o Realtime entregar o mesmo INSERT depois, o upsert deduplica por id.
      if (result.data?.task) {
        setTasks((prev) => upsertTask(prev, result.data!.task))
      }
      setFormError(null)
      resetForm()
      setShowTaskForm(false)
      router.refresh()
    })
  }

  function handleApprove(task: Task) {
    // Otimista: `APPROVED`. O rollback só desfaz se o card ainda estiver
    // `APPROVED` — se o Realtime já trouxe o `COMPLETED` real (o dependente
    // concluiu no mesmo instante), o dado novo é preservado.
    void runTaskTransition(
      task,
      () => ({ ...task, status: 'APPROVED' }),
      () => approveTask(task.id),
      { fallbackMessage: 'Tarefa aprovada' }
    )
  }

  function handleRejectComplete(task: Task) {
    // COMPLETED → PENDING. O otimista limpa a conclusão.
    void runTaskTransition(
      task,
      () => ({
        ...task,
        status: 'PENDING',
        completed_by: null,
        completed_at: null,
      }),
      () => rejectCompletedTask(task.id),
      { fallbackMessage: 'Tarefa devolvida' }
    )
  }

  function handleAdminComplete(task: Task) {
    // O servidor também grava `completed_by`/`completed_at`; não é preciso no
    // otimista porque o card já sai da seção de pendentes — o Realtime e o
    // `router.refresh()` completam o resto.
    void runTaskTransition(
      task,
      () => ({ ...task, status: 'APPROVED' }),
      () => adminCompleteTask(task.id),
      { fallbackMessage: 'Tarefa concluída e creditada' }
    )
  }

  function handleMarkNotDelivered(task: Task) {
    // PENDING/IN_PROGRESS → NOT_DELIVERED (o servidor debita os pontos; a
    // penalidade é definitiva). O otimista só muda o status — o saldo do
    // dependente é outro componente, sincronizado pelo Realtime de `profiles`.
    void runTaskTransition(
      task,
      () => ({ ...task, status: 'NOT_DELIVERED' }),
      () => markTaskNotDelivered(task.id),
      {
        successToast: 'warning',
        fallbackMessage: 'Tarefa marcada como não entregue',
      }
    )
  }

  function handleSetOnHold(task: Task, onHold: boolean) {
    // Pausar: o card sai da lista de pendentes e some para o dependente. A
    // reativação devolve para PENDING com prazo novo.
    // Prefere a linha autoritativa devolvida pela action (status, prazo e
    // `decay_started_at` reais) — o `run` reconcilia assim que ela responder.
    void runTaskTransition(
      task,
      () =>
        onHold
          ? {
              ...task,
              status: 'ON_HOLD',
              extension_requested: false,
              extension_reason: null,
              points: task.status === 'NOT_DELIVERED' ? 0 : task.points,
            }
          : {
              ...task,
              status: 'PENDING',
              due_date: new Date(
                Date.now() + defaultDueDays * 24 * 60 * 60 * 1000
              ).toISOString(),
              extension_requested: false,
              extension_reason: null,
            },
      async () => {
        const result = await setTaskOnHold(task.id, onHold)
        if (result.ok && result.data?.task) {
          setTasks((prev) => upsertTask(prev, result.data!.task))
        }
        return result
      },
      {
        fallbackMessage: onHold
          ? 'Tarefa colocada em espera'
          : 'Tarefa reativada',
      }
    )
  }

  function handleRestore(task: Task) {
    // APPROVED → PENDING com prazo reiniciado (prazo padrão da casa). Os pontos
    // já creditados são mantidos e a tarefa reaparece para o dependente.
    void runTaskTransition(
      task,
      () => ({
        ...task,
        status: 'PENDING',
        due_date: new Date(
          Date.now() + defaultDueDays * 24 * 60 * 60 * 1000
        ).toISOString(),
        completed_by: null,
        completed_at: null,
        extension_requested: false,
        extension_reason: null,
      }),
      async () => {
        const result = await restoreTask(task.id)
        // Linha autoritativa (com o `due_date`/`decay_started_at` reais).
        if (result.ok && result.data?.task) {
          setTasks((prev) => upsertTask(prev, result.data!.task))
        }
        return result
      },
      { fallbackMessage: 'Tarefa restaurada' }
    )
  }

  function handleResolveExtension(task: Task, approve: boolean, days = 3) {
    // Esta transição NÃO muda o status na maioria dos casos (só limpa o pedido).
    // Numa tarefa "não entregue", aprovar reabre valendo 0 pontos conforme o novo
    // prazo (a penalidade é definitiva) — o servidor recalcula o prazo, então o
    // otimista só faz a troca de seção; a linha autoritativa vem na resposta.
    // Numa tarefa aberta, o aceite espelha a regra do decaimento: novo ciclo a
    // partir do valor CORRENTE, com o relógio reiniciado (calculado com o prazo
    // ANTIGO, que é o que capava a janela).
    void runTaskTransition(
      task,
      () => ({
        ...task,
        extension_requested: false,
        extension_reason: null,
        extension_count: approve
          ? task.extension_count + 1
          : task.extension_count,
        ...(approve && task.status === 'NOT_DELIVERED'
          ? { points: 0, status: 'PENDING' as Task['status'] }
          : {}),
        ...(approve && task.status !== 'NOT_DELIVERED'
          ? {
              points: getTaskCurrentPoints(
                task.points,
                getTaskDecayStart(task.created_at, task.decay_started_at),
                task.due_date,
                decay
              ),
              decay_started_at: new Date().toISOString(),
            }
          : {}),
      }),
      async () => {
        const result = await resolveTaskExtension(task.id, approve, days)
        if (result.ok && result.data?.task) {
          setTasks((prev) => upsertTask(prev, result.data!.task))
        }
        return result
      },
      {
        successToast: approve ? 'success' : 'info',
        fallbackMessage: approve
          ? `Adiamento aprovado (+${days} dias)`
          : 'Pedido de adiamento rejeitado',
      }
    )
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
    //
    // Reflete as DUAS regras do aceite (as mesmas do servidor, calculadas com o
    // prazo ANTIGO que capava a janela do decaimento): numa tarefa "não
    // entregue", mudar o prazo reabre com 0 pontos — a penalidade é definitiva e
    // o que foi debitado não volta; numa tarefa aberta, o adiamento aceito abre
    // um NOVO CICLO a partir do valor CORRENTE (10 que decaiu para 7 → a nova
    // base é 7), então o relógio do decaimento também reinicia.
    setTasks((prev) =>
      prev.map((item) => {
        if (item.id !== taskId) return item
        const changed =
          (item.due_date ? new Date(item.due_date).getTime() : null) !==
          (nextDue ? new Date(nextDue).getTime() : null)
        const accepted = Boolean(item.extension_requested) && changed
        const cleared = accepted
          ? { extension_requested: false, extension_reason: null }
          : {}
        const reopened =
          item.status === 'NOT_DELIVERED' && changed
            ? {
                points: 0,
                status: (nextDue && new Date(nextDue).getTime() < Date.now()
                  ? 'NOT_DELIVERED'
                  : 'PENDING') as Task['status'],
              }
            : {}
        const recycled =
          accepted && item.status !== 'NOT_DELIVERED'
            ? {
                points: getTaskCurrentPoints(
                  item.points,
                  getTaskDecayStart(item.created_at, item.decay_started_at),
                  item.due_date,
                  decay
                ),
                decay_started_at: new Date().toISOString(),
              }
            : {}
        return {
          ...item,
          due_date: nextDue,
          decay_started_at: new Date().toISOString(),
          ...cleared,
          ...reopened,
          ...recycled,
        }
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
              <div className="grid gap-2">
                <Label htmlFor="task-title">Título</Label>
                {/* O dropdown é posicionado por este wrapper (não pela célula
                    inteira), para abrir logo abaixo do input, sobre a dica. */}
                <div className="relative">
                  <ClearableInput
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

                  {/* Autocomplete "Você quis dizer..." — combinação de palavras do
                      catálogo da casa, até 3 sugestões (melhor combinação 1º). */}
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
                <p className="text-xs text-slate-500">
                  As sugestões combinam as palavras digitadas, em qualquer
                  ordem — até um caractere serve (&quot;q&quot; encontra
                  &quot;quarto&quot;).
                </p>
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
        <CardColumns className="gap-x-3 xl:columns-2 [&>*]:mb-3">
          {pendingTasks.map((task) => {
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
              // Valor corrente sob o decaimento (base − perdas desde o start do
              // decaimento até agora/prazo).
              const currentPoints = getTaskCurrentPoints(
                task.points,
                getTaskDecayStart(task.created_at, task.decay_started_at),
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
                            onSavingStatusChange={(status) => {
                              setSavingStatuses(prev => ({ ...prev, [task.id]: status }));
                            }}
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
                          onSavingStatusChange={(status) => {
                            setSavingStatuses(prev => ({ ...prev, [task.id]: status }));
                          }}
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
                                A penalidade é definitiva: aprovar reabre a tarefa
                                valendo 0, sem devolver os pontos debitados.
                              </p>
                            ) : null}
                            {maxExtensions > 0 ? (
                              <p className="mt-1 text-xs text-blue-700">
                                Esta tarefa já teve {task.extension_count} de{' '}
                                {maxExtensions} adiamento(s) da casa.
                              </p>
                            ) : null}
                            <div className="mt-2 flex flex-wrap gap-2">
                              {extensionDayOptions.map((days) => (
                                <Button
                                  key={days}
                                  type="button"
                                  size="sm"
                                  disabled={pendingIds.has(task.id)}
                                  className="min-h-9 bg-emerald-500 hover:bg-emerald-600"
                                  onClick={() => handleResolveExtension(task, true, days)}
                                >
                                  {pendingIds.has(task.id)
                                    ? 'Aprovando...'
                                    : `Aprovar (+${days} ${days === 1 ? 'dia' : 'dias'})`}
                                </Button>
                              ))}
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={pendingIds.has(task.id)}
                                className="min-h-9 text-slate-600"
                                onClick={() => handleResolveExtension(task, false)}
                              >
                                <X className="size-3.5" />
                                {pendingIds.has(task.id)
                                  ? 'Rejeitando...'
                                  : 'Rejeitar'}
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
                                onSavingStatusChange={(status) => {
                                  setSavingStatuses(prev => ({ ...prev, [task.id]: status }));
                                }}
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
                              onSavingStatusChange={(status) => {
                                setSavingStatuses(prev => ({ ...prev, [task.id]: status }));
                              }}
                            />
                          </div>
                        </div>
  
                        {isNotDelivered ? (
                          <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                            Tarefa marcada como não entregue — {currentPoints} pt(s) já
                            debitado(s) do dependente. A penalidade é definitiva: aprovar
                            um adiamento (ou alterar o prazo) reabre a tarefa valendo 0
                            pontos — os pontos debitados não voltam.
                          </p>
                        ) : (
                          <div className="flex flex-col gap-2 sm:flex-row">
                            {/* Se estiver salvando/salvo, oculta o botão verde e exibe a mensagem de feedback */}
                            {(savingStatuses[task.id] ?? 'idle') !== 'idle' ? (
                              <div className="flex w-full items-center justify-center rounded-xl bg-slate-100 px-3 py-2.5 text-xs font-medium sm:flex-1">
                                {savingStatuses[task.id] === 'saving' && (
                                  <span className="text-slate-500 animate-pulse">⏳ Salvando alterações...</span>
                                )}
                                {savingStatuses[task.id] === 'saved' && (
                                  <span className="text-emerald-600 font-semibold">✓ Alterações salvas</span>
                                )}
                              </div>
                            ) : (
                              <Button
                                type="button"
                                onClick={() => handleAdminComplete(task)}
                                disabled={pendingIds.has(task.id)}
                                className="w-full bg-emerald-500 shadow-lg shadow-emerald-500/25 hover:bg-emerald-600 sm:flex-1"
                              >
                                {pendingIds.has(task.id)
                                  ? 'Concluindo...'
                                  : 'Aprovar Tarefa e Creditar'}
                              </Button>
                            )}
  
                            {/* O botão 'Marcar como não entregue' também só aparece se não estiver editando */}
                            {sla === 'overdue' && (savingStatuses[task.id] ?? 'idle') === 'idle' ? (
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => handleMarkNotDelivered(task)}
                                disabled={pendingIds.has(task.id)}
                                className="w-full border-red-200 text-red-700 hover:bg-red-50 sm:flex-1"
                              >
                                {pendingIds.has(task.id)
                                  ? 'Marcando...'
                                  : 'Marcar como não entregue'}
                              </Button>
                            ) : null}
                          </div>
                        )}
  
                        {/* Pausar: some da lista do dependente (vale também para a
                            "não entregue" — a penalidade continua definitiva). */}
                        {(savingStatuses[task.id] ?? 'idle') === 'idle' ? (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleSetOnHold(task, true)}
                            disabled={pendingIds.has(task.id)}
                            className="w-full text-slate-600"
                          >
                            <PauseCircle className="size-4" />
                            {pendingIds.has(task.id)
                              ? 'Colocando...'
                              : 'Colocar em espera'}
                          </Button>
                        ) : null}
                      </>
                    ) : null}
                  </CardContent>
                </Card>
              )
            })}
        </CardColumns>
        )}
      </section>

      {/* Tarefas pausadas: visíveis só para o ADMIN, com o botão de reativar
          sempre à vista (fora do toggle), como o "Restaurar" das aprovadas. */}
      {heldTasks.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-slate-800">
            <PauseCircle className="size-4 text-slate-400" />
            Em espera
          </h2>
          <CardColumns className="gap-x-3 xl:columns-2 [&>*]:mb-3">
            {heldTasks.map((task) => {
              const isExpanded = expandedIds.has(task.id)
  
              return (
                <Card
                  key={task.id}
                  className="border-l-4 border-l-slate-400"
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
                        <span
                          className={cn(
                            'shrink-0 rounded-full px-2.5 py-1 text-xs font-medium',
                            taskChipByStatus.ON_HOLD.className
                          )}
                        >
                          {taskChipByStatus.ON_HOLD.label}
                        </span>
                        <span
                          className={cn(
                            'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold',
                            POINTS_PILL_CLASS
                          )}
                        >
                          {task.points} pts
                        </span>
                        <Button
                          variant="outline"
                          onClick={() => handleSetOnHold(task, false)}
                          disabled={pendingIds.has(task.id)}
                          className="min-h-9 shrink-0 text-slate-600"
                        >
                          <PlayCircle className="size-4" />
                          {pendingIds.has(task.id)
                            ? 'Reativando...'
                            : 'Voltar para pendente'}
                        </Button>
                      </div>
                    </div>
                    {isExpanded ? (
                      <>
                        {task.image_url ? (
                          <img
                            src={task.image_url}
                            alt=""
                            className="mt-1 h-32 w-full rounded-xl border border-slate-200 object-cover"
                          />
                        ) : null}
  
                        {/* Pausar esconde a tarefa do dependente, mas NÃO congela a
                            edição: os mesmos campos do card pendente, com salvamento
                            automático. O status continua sendo ON_HOLD — só o botão
                            "Voltar para pendente" reativa. */}
                        <div className="mt-2 grid gap-3 md:grid-cols-[1fr_auto]">
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
  
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="grid gap-1">
                            <span className="text-xs text-slate-500">Pontos</span>
                            <DebouncedField
                              value={String(task.points)}
                              onSave={savePoints(task.id)}
                              type="number"
                            />
                          </div>
                          {/* Prazo não é editável aqui: a reativação SEMPRE calcula um
                              prazo novo (agora + padrão da casa), então editar o
                              campo agora seria descartado em silêncio. */}
                          <div className="grid gap-1">
                            <span className="text-xs text-slate-500">
                              Prazo atual (temporário)
                            </span>
                            <p className="flex min-h-12 items-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 text-sm text-slate-500">
                              {task.due_date ? (
                                <FormattedDateTime iso={task.due_date} />
                              ) : (
                                'sem prazo'
                              )}
                            </p>
                          </div>
                        </div>
  
                        <p className="mt-1 text-xs text-slate-400">
                          Em espera: invisível para o dependente (ele não vê, não
                          conclui e não pede mais tempo). Você pode editar o que
                          quiser; ao voltar, ela retorna como pendente com prazo
                          novo e o decaimento reiniciado
                          {task.points === 0
                            ? ' — valendo 0 pontos (penalidade já aplicada).'
                            : '.'}
                        </p>
                      </>
                    ) : null}
                  </CardContent>
                </Card>
              )
            })}
          </CardColumns>
        </section>
      ) : null}

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
        <CardColumns className="gap-x-3 xl:columns-2 [&>*]:mb-3">
          {completedTasks.map((task) => {
              const isExpanded = expandedIds.has(task.id)
              // Valor corrente sob o decaimento (o que será creditado na aprovação).
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
                          disabled={pendingIds.has(task.id)}
                          className="min-h-9 shrink-0 text-slate-600"
                        >
                          {pendingIds.has(task.id)
                            ? 'Desaprovando...'
                            : 'Desaprovar'}
                        </Button>
                        <Button
                          onClick={() => handleApprove(task)}
                          disabled={pendingIds.has(task.id)}
                          className="min-h-9 shrink-0 bg-emerald-500 shadow-lg shadow-emerald-500/25 hover:bg-emerald-600"
                        >
                          {pendingIds.has(task.id) ? (
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
                          {task.completed_at ? (
                            <>
                              {' · concluída em '}
                              {/* `FormattedDateTime` e não `toLocaleString` direto:
                                  este card é renderizado no SSR, e formatar com
                                  getters locais no servidor (Vercel/Netlify = UTC)
                                  gera hydration mismatch + flash — ver ADR-0013. */}
                              <FormattedDateTime iso={task.completed_at} />
                            </>
                          ) : null}
                        </p>
                      </>
                    ) : null}
                  </CardContent>
                </Card>
              )
            })}
        </CardColumns>
        )}
      </section>

      {approvedTasks.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-slate-800">
            <CircleCheckBig className="size-4 text-emerald-500" />
            Aprovadas
          </h2>
          <CardColumns className="gap-x-3 xl:columns-2 [&>*]:mb-3">
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
                          disabled={pendingIds.has(task.id)}
                          className="min-h-9 shrink-0 text-slate-600"
                        >
                          {pendingIds.has(task.id)
                            ? 'Restaurando...'
                            : 'Restaurar'}
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
          </CardColumns>
        </section>
      ) : null}
    </div>
  )
}
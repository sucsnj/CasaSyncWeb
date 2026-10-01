'use client'

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { Flame, Megaphone } from 'lucide-react'
import { confirmComunicadoDelivery } from '@/actions/comunicados'
import { markNotificationRead } from '@/actions/notifications'
import { usePostgresChanges } from '@/hooks/use-postgres-changes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { DueComunicado } from '@/utils/comunicados'
import {
  ALERT_TYPED_WORDS_REQUIRED,
  isPendingPenalty,
  matchedAlertWords,
  sortAlertQueue,
  toComunicadoAlertItem,
  toPenaltyAlertItem,
  type AlertQueueItem,
} from '@/utils/alert-queue'
import type { NotificationRow } from '@/types/notifications'

/**
 * FILA DE ALERTAS BLOQUEANTES do DEPENDENTE — uma coisa por vez, em FIFO.
 *
 * Tudo que exige confirmação entra na MESMA fila: os comunicados publicados e o
 * alerta de penalização. O alerta de penalização **não tem prioridade** — segue
 * a ordem natural (item mais antigo primeiro), então um comunicado pode vir
 * antes dele e vice-versa.
 *
 * Fechar um item:
 * - **comunicado** → `confirmComunicadoDelivery` grava a confirmação
 *   (`comunicado_deliveries`) e agenda a próxima repetição. Exige digitar ao
 *   menos {ALERT_TYPED_WORDS_REQUIRED} palavras do próprio aviso (regra de leitura
 *   conferida; o servidor revalida — a UI não é garantia).
 * - **penalização** → só "Entendi" (marca a notificação como lida).
 *
 * SEM tempo real nos comunicados (decisão de produto): a fila de comunicados vem
 * do servidor no render de cada tela (`getDueComunicados()`) e muda quando o
 * dependente confirma; a de penalizações também nasce no render e acompanha o
 * Realtime de `notifications`.
 */
const emptySubscribe = () => () => {}

export function AlertQueueOverlay({
  userId,
  initialQueue,
  initialNotifications = [],
}: {
  userId: string
  initialQueue: DueComunicado[]
  initialNotifications?: NotificationRow[]
}) {
  // Comunicados já confirmados NESTA montagem: somem da fila na hora (a fila
  // avança sem esperar o servidor) e não voltam enquanto o componente viver,
  // mesmo que um `router.refresh()` ainda traga a lista antiga.
  const [confirmed, setConfirmed] = useState<ReadonlySet<string>>(() => new Set())
  const [penalties, setPenalties] = useState<AlertQueueItem[]>(() =>
    sortAlertQueue(
      initialNotifications.filter(isPendingPenalty).map(toPenaltyAlertItem)
    )
  )
  // Digitação guardada com o id do item: trocar de item (FIFO) zera sozinho.
  const [phrase, setPhrase] = useState({ id: '', text: '' })
  const [pending, setPending] = useState(false)
  // O overlay é exclusivamente client-side (portal em `document.body`): montar a
  // árvore durante o SSR divergia do cliente (branch `typeof document`), o que
  // quebrava a hidratação quando a fila tinha itens. `useSyncExternalStore`
  // (padrão do `FormattedDateTime`): o snapshot do servidor é `false`, o do
  // cliente é `true` — o portal só existe após a hidratação, sem efeito.
  const isMounted = useSyncExternalStore(emptySubscribe, () => true, () => false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const phraseRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  const queue = useMemo(
    () =>
      sortAlertQueue([
        ...initialQueue
          .filter((due) => !confirmed.has(due.id))
          .map(toComunicadoAlertItem),
        ...penalties,
      ]),
    [initialQueue, confirmed, penalties]
  )

  const current = queue[0]
  const isComunicado = current?.kind === 'comunicado'

  // Realtime: penalização nova entra na MESMA fila (sem prioridade, respeita a
  // ordem) e uma já lida no sino sai da fila.
  usePostgresChanges<NotificationRow>({
    table: 'notifications',
    filter: `recipient_id=eq.${userId}`,
    onUpsert: (notification) => {
      if (notification.type !== 'PENALTY') return
      setPenalties((prev) => {
        const without = prev.filter((item) => item.id !== notification.id)
        if (notification.read_at) return without
        return sortAlertQueue([...without, toPenaltyAlertItem(notification)])
      })
    },
    onDelete: (id) => {
      setPenalties((prev) => prev.filter((item) => item.id !== id))
    },
  })

  const typedText = current && phrase.id === current.id ? phrase.text : ''
  const matchedCount =
    isComunicado && current
      ? matchedAlertWords(
          typedText,
          `${current.title} ${current.description}`
        ).length
      : 0
  const canConfirm = !isComunicado || matchedCount >= ALERT_TYPED_WORDS_REQUIRED

  // Enquanto um alerta está na tela: trava o scroll, prende o foco na janela e
  // bloqueia o Esc (o item só fecha ao confirmar/entender).
  useEffect(() => {
    if (!current) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    if (current.kind === 'comunicado') phraseRef.current?.focus()
    else confirmRef.current?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        return
      }
      if (event.key !== 'Tab') return
      // Foco cicla só entre os campos do alerta atual (não vaza para a página).
      const focusables = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'input:not([disabled]), button:not([disabled])'
        ) ?? []
      )
      if (focusables.length === 0) return
      event.preventDefault()
      const index = focusables.indexOf(document.activeElement as HTMLElement)
      const next =
        index === -1
          ? 0
          : (index + (event.shiftKey ? -1 : 1) + focusables.length) % focusables.length
      focusables[next]?.focus()
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [current])

  async function handleConfirm() {
    if (!current || pending || !canConfirm) return
    setPending(true)
    const item = current
    try {
      if (item.kind === 'comunicado') {
        const res = await confirmComunicadoDelivery(item.id, typedText)
        // Sai da fila mesmo se o servidor recusar (item obsoleto/praga antiga):
        // insistir no mesmo item bloquearia a fila inteira.
        setConfirmed((prev) => new Set(prev).add(item.id))
        if (!res.ok) toast.error(res.error)
      } else {
        await markNotificationRead(item.id)
        setPenalties((prev) => prev.filter((entry) => entry.id !== item.id))
      }
    } catch {
      toast.error('Falha ao confirmar. Tente novamente.')
    } finally {
      setPending(false)
    }
  }

  if (!current || !isMounted) return null

  // Narrowing de `current` para as closures do JSX abaixo.
  const item = current
  const itemId = item.id

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-4 text-slate-800">
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-label={current.title}
        className="flex w-full max-w-md flex-col gap-4 rounded-2xl bg-white p-6 shadow-2xl outline-none"
      >
        {queue.length > 1 ? (
          <p className="text-right text-xs font-medium text-slate-400">
            Item 1 de {queue.length}
          </p>
        ) : null}

        {item.kind === 'comunicado' ? (
          <>
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                <Megaphone className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">
                  Comunicado da casa
                </p>
                <p className="text-lg font-bold leading-snug text-slate-900">
                  {item.title}
                </p>
              </div>
            </div>

            <p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
              {item.description}
            </p>

            {item.remaining > 1 ? (
              <p className="text-center text-xs text-slate-500">
                Este comunicado aparecerá mais {item.remaining - 1}{' '}
                {item.remaining - 1 === 1 ? 'vez' : 'vezes'}.
              </p>
            ) : null}

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="alert-queue-phrase"
                className="text-sm font-medium text-slate-700"
              >
                Digite {ALERT_TYPED_WORDS_REQUIRED} palavras do aviso para
                confirmar a leitura
              </label>
              <Input
                id="alert-queue-phrase"
                ref={phraseRef}
                value={typedText}
                onChange={(event) =>
                  setPhrase({ id: itemId, text: event.target.value })
                }
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="Ex.: recolher o lixo antes do jantar"
                aria-describedby="alert-queue-phrase-hint"
              />
              <p
                id="alert-queue-phrase-hint"
                className={
                  canConfirm
                    ? 'text-xs font-medium text-emerald-600'
                    : 'text-xs text-slate-500'
                }
              >
                {canConfirm
                  ? 'Leitura confirmada. Pode confirmar o aviso.'
                  : `${matchedCount} de ${ALERT_TYPED_WORDS_REQUIRED} palavras — pode usar o título ou a descrição, sem diferenciar maiúsculas nem acentos.`}
              </p>
            </div>

            <Button
              ref={confirmRef}
              onClick={handleConfirm}
              disabled={pending || !canConfirm}
              className="w-full"
            >
              {pending ? 'Confirmando…' : 'Confirmar'}
            </Button>
          </>
        ) : (
          <>
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="flex size-14 items-center justify-center rounded-full bg-red-100 text-red-600">
                <Flame className="size-7 animate-bounce" />
              </span>
              <p className="text-2xl font-black text-red-600">
                {item.points}
              </p>
              <p className="text-sm font-medium text-slate-600">
                {item.reason}
              </p>
            </div>

            <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
              Esta redução foi aplicada por um administrador. Mantenha suas
              tarefas em dia para acumular novos pontos!
            </p>

            <Button
              ref={confirmRef}
              onClick={handleConfirm}
              disabled={pending}
              className="w-full"
            >
              {pending ? 'Confirmando…' : 'Entendi'}
            </Button>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}
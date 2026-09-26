'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { Megaphone } from 'lucide-react'
import {
  confirmComunicadoDelivery,
  getDueComunicados,
} from '@/actions/comunicados'
import { usePostgresChanges } from '@/hooks/use-postgres-changes'
import { Button } from '@/components/ui/button'
import type { DueComunicado } from '@/utils/comunicados'
import type { NotificationRow } from '@/types/notifications'

/**
 * Fila de comunicados "devidos" do DEPENDENTE. Exibe um aviso por vez, com
 * foco bloqueante (sem X, sem fechar por fora, sem Esc) até tocar em
 * "Confirmar" — isso registra a confirmação (`comunicado_deliveries`) e
 * agenda a próxima repetição conforme a configuração do ADMIN.
 *
 * A fila inicial vem do servidor (próxima abertura); eventos Realtime de
 * publicação/edição reavaliam a fila ao vivo.
 */
const emptySubscribe = () => () => {}

export function ComunicadoOverlay({
  houseId,
  userId,
  initialQueue,
}: {
  houseId: string
  userId: string
  initialQueue: DueComunicado[]
}) {
  const [queue, setQueue] = useState<DueComunicado[]>(initialQueue)
  const [pending, setPending] = useState(false)
  // O overlay é exclusivamente client-side (portal em `document.body`): montar a
  // árvore durante o SSR divergia do cliente (branch `typeof document`), o que
  // quebrava a hidratação quando a fila tinha itens. `useSyncExternalStore`
  // (padrão do `FormattedDateTime`): o snapshot do servidor é `false`, o do
  // cliente é `true` — o portal só existe após a hidratação, sem efeito.
  const isMounted = useSyncExternalStore(emptySubscribe, () => true, () => false)
  const excludedRef = useRef(new Set<string>())
  const confirmRef = useRef<HTMLButtonElement>(null)

  function applyDue(list: DueComunicado[]) {
    const excluded = excludedRef.current
    setQueue(list.filter((item) => !excluded.has(item.id)))
  }

  async function refreshDue() {
    try {
      applyDue(await getDueComunicados())
    } catch (err) {
      console.error('[COMUNICADOS] Falha ao atualizar a fila:', err)
    }
  }

  // Realtime: publicar/editar/despublicar/excluir um comunicado reavalia a
  // fila do dependente (o servidor decide o que é "devido" — a agenda mora lá).
  usePostgresChanges<{ id: string }>({
    table: 'comunicados',
    filter: `house_id=eq.${houseId}`,
    onUpsert: () => {
      void refreshDue()
    },
    onDelete: () => {
      void refreshDue()
    },
  })

  // Sinal de publicação: a publicação do ADMIN também grava uma notificação
  // por dependente (`notifications` é o canal que entrega ao vivo com
  // confiança neste app — sino/toast). Ao receber, reavalia a fila: garante a
  // 1ª exibição imediata mesmo se o Realtime de `comunicados` não entregar.
  usePostgresChanges<NotificationRow>({
    table: 'notifications',
    filter: `recipient_id=eq.${userId}`,
    event: 'INSERT',
    onUpsert: (notification) => {
      if (notification.type === 'COMUNICADO_PUBLISHED') {
        void refreshDue()
      }
    },
  })

  const current = queue[0]

  // Enquanto um aviso está na tela: trava o scroll, prende o foco no botão e
  // bloqueia o Esc (o comunicado só fecha ao "Confirmar").
  useEffect(() => {
    if (!current) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    confirmRef.current?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        return
      }
      if (event.key === 'Tab') {
        event.preventDefault()
        confirmRef.current?.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [current])

  async function handleConfirm() {
    if (!current || pending) return
    setPending(true)
    const confirmedId = current.id
    try {
      const res = await confirmComunicadoDelivery(confirmedId)
      excludedRef.current.add(confirmedId)
      setQueue((prev) => prev.filter((item) => item.id !== confirmedId))
      if (!res.ok) {
        toast.error(res.error)
      }
    } catch {
      toast.error('Falha ao confirmar o comunicado. Tente novamente.')
    } finally {
      setPending(false)
      void refreshDue()
    }
  }

  if (!current || !isMounted) return null

  const remaining = current.remaining

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-4 text-slate-800">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={current.title}
        className="flex w-full max-w-md flex-col gap-4 rounded-2xl bg-white p-6 shadow-2xl outline-none"
      >
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
            <Megaphone className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">
              Comunicado da casa
            </p>
            <p className="truncate text-lg font-bold leading-snug text-slate-900">
              {current.title}
            </p>
          </div>
        </div>

        <p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
          {current.description}
        </p>

        <div className="flex flex-col gap-2">
          {remaining > 1 ? (
            <p className="text-center text-xs text-slate-500">
              Este comunicado aparecerá mais {remaining - 1}{' '}
              {remaining - 1 === 1 ? 'vez' : 'vezes'}.
            </p>
          ) : null}

          <Button
            ref={confirmRef}
            onClick={handleConfirm}
            disabled={pending}
            className="w-full"
          >
            {pending ? 'Confirmando…' : 'Confirmar'}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Bell,
  Check,
  CheckCheck,
  ChevronDown,
  CircleCheck,
  CircleCheckBig,
  Clock,
  Gift,
  Lightbulb,
  ListTodo,
  MessageSquare,
  RotateCcw,
  ShoppingBag,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { QuickMessageComposer } from '@/components/notifications/quick-message-composer'
import { usePostgresChanges } from '@/hooks/use-postgres-changes'
import type { QuickMessageSettings } from '@/utils/settings'
import {
  deleteAllNotifications,
  deleteNotification,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/actions/notifications'
import type { NotificationRow, NotificationType } from '@/types/notifications'

const TYPE_META: Record<
  NotificationType,
  { icon: LucideIcon; chip: string }
> = {
  TASK_CREATED: { icon: ListTodo, chip: 'bg-blue-100 text-blue-700' },
  TASK_COMPLETED: { icon: CircleCheck, chip: 'bg-amber-100 text-amber-700' },
  TASK_APPROVED: {
    icon: CircleCheckBig,
    chip: 'bg-emerald-100 text-emerald-700',
  },
  TASK_REJECTED: { icon: RotateCcw, chip: 'bg-blue-100 text-blue-700' },
  TASK_NOT_DELIVERED: { icon: Clock, chip: 'bg-red-100 text-red-700' },
  TASK_RESTORED: { icon: RotateCcw, chip: 'bg-sky-100 text-sky-700' },
  EXTENSION_REQUESTED: { icon: Clock, chip: 'bg-sky-100 text-sky-700' },
  EXTENSION_APPROVED: { icon: Clock, chip: 'bg-emerald-100 text-emerald-700' },
  EXTENSION_REJECTED: { icon: Clock, chip: 'bg-red-100 text-red-700' },
  REWARD_CREATED: { icon: Gift, chip: 'bg-amber-100 text-amber-700' },
  REDEMPTION_REQUESTED: { icon: ShoppingBag, chip: 'bg-blue-100 text-blue-700' },
  REDEMPTION_APPROVED: {
    icon: ShoppingBag,
    chip: 'bg-emerald-100 text-emerald-700',
  },
  REDEMPTION_REJECTED: { icon: ShoppingBag, chip: 'bg-red-100 text-red-700' },
  SUGGESTION_CREATED: { icon: Lightbulb, chip: 'bg-amber-100 text-amber-700' },
  SUGGESTION_APPROVED: {
    icon: Lightbulb,
    chip: 'bg-emerald-100 text-emerald-700',
  },
  SUGGESTION_REJECTED: { icon: Lightbulb, chip: 'bg-red-100 text-red-700' },
  QUICK_MESSAGE: { icon: MessageSquare, chip: 'bg-violet-100 text-violet-700' },
}

function metaFor(type: string) {
  return TYPE_META[type as NotificationType] ?? {
    icon: Bell,
    chip: 'bg-slate-100 text-slate-600',
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `há ${days} d`
  return new Date(iso).toLocaleDateString('pt-BR')
}

export function NotificationsBell({
  userId,
  initialNotifications,
  canSend = false,
  quickMessageSettings,
}: {
  userId: string
  initialNotifications: NotificationRow[]
  canSend?: boolean
  quickMessageSettings?: QuickMessageSettings
}) {
  const router = useRouter()
  const [items, setItems] = useState<NotificationRow[]>(initialNotifications)
  const [open, setOpen] = useState(false)
  // Cards de mensagem rápida colapsáveis — todos recolhidos por padrão.
  const [expandedQuickIds, setExpandedQuickIds] = useState<Set<string>>(
    () => new Set()
  )

  const unread = items.filter((item) => !item.read_at).length

  // Realtime: novas notificações e atualizações chegam com RLS de SELECT por
  // `recipient_id = auth.uid()` — o filter abaixo é só o índice de origem.
  usePostgresChanges<NotificationRow>({
    table: 'notifications',
    filter: `recipient_id=eq.${userId}`,
    event: '*',
    onUpsert: (row) =>
      setItems((prev) => {
        const exists = prev.some((item) => item.id === row.id)
        const next = exists
          ? prev.map((item) => (item.id === row.id ? row : item))
          : [row, ...prev]
        return next.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
      }),
    onDelete: (id) => setItems((prev) => prev.filter((item) => item.id !== id)),
  })

  function markRead(id: string) {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id && !item.read_at
          ? { ...item, read_at: new Date().toISOString() }
          : item
      )
    )
    void markNotificationRead(id).catch(() => {})
  }

  function openItem(item: NotificationRow) {
    if (!item.read_at) markRead(item.id)
    if (item.link) router.push(item.link)
    setOpen(false)
  }

  // Mensagem rápida: o toque no cabeçalho colapsa/expande o card (inicia
  // recolhido). Expandir marca como lida automaticamente; não há link.
  function toggleQuick(item: NotificationRow) {
    setExpandedQuickIds((prev) => {
      const next = new Set(prev)
      if (next.has(item.id)) next.delete(item.id)
      else next.add(item.id)
      return next
    })
    if (!item.read_at) markRead(item.id)
  }

  function markAllRead() {
    const now = new Date().toISOString()
    setItems((prev) =>
      prev.map((item) => (item.read_at ? item : { ...item, read_at: now }))
    )
    void markAllNotificationsRead().catch(() => {})
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id))
    void deleteNotification(id).catch(() => {})
  }

  function removeAll() {
    setItems([])
    void deleteAllNotifications().catch(() => {})
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={
          unread > 0 ? `Notificações (${unread} não lidas)` : 'Notificações'
        }
        className="relative flex size-10 items-center justify-center rounded-xl text-blue-100 transition-all duration-200 hover:bg-white/10 hover:text-white active:scale-95"
      >
        <Bell className="size-5" />
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-amber-400 px-1 text-[0.65rem] font-bold leading-5 text-slate-900 shadow-sm">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Notificações">
        {canSend ? (
          <QuickMessageComposer
            userId={userId}
            settings={quickMessageSettings}
          />
        ) : null}

        {items.length > 0 ? (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-slate-500">
              {unread > 0
                ? `${unread} não lida(s)`
                : 'Tudo lido por aqui'}
            </p>
            <div className="flex items-center gap-2">
              {unread > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-9 gap-1.5 rounded-lg border-blue-200 bg-blue-50 px-2.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 hover:text-blue-800"
                  onClick={markAllRead}
                >
                  <CheckCheck className="size-4" />
                  Marcar todas
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-9 gap-1.5 rounded-lg border-red-200 bg-red-50 px-2.5 text-xs font-semibold text-red-600 hover:bg-red-100 hover:text-red-700"
                onClick={removeAll}
              >
                <Trash2 className="size-4" />
                Apagar todas
              </Button>
            </div>
          </div>
        ) : null}

        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <Bell className="size-6" />
            </span>
            <p className="font-medium text-slate-700">Nenhuma notificação</p>
            <p className="text-sm text-slate-500">
              {canSend
                ? 'Avisos de tarefas, resgates e sugestões aparecem aqui — e você também pode enviar uma mensagem rápida para seus tutores.'
                : 'Avisos de tarefas, resgates e sugestões aparecem aqui.'}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) => {
              const meta = metaFor(item.type)
              const expanded =
                item.type === 'QUICK_MESSAGE' && expandedQuickIds.has(item.id)
              return (
                <li
                  key={item.id}
                  className={cn(
                    'rounded-xl border p-3 transition-colors',
                    item.read_at
                      ? 'border-slate-100 bg-white hover:bg-slate-50'
                      : 'border-blue-200 bg-blue-50/70 hover:bg-blue-50',
                    item.type === 'QUICK_MESSAGE'
                      ? 'flex flex-col gap-2'
                      : 'flex items-start gap-3'
                  )}
                >
                  <div
                    className={
                      item.type === 'QUICK_MESSAGE'
                        ? 'flex items-start gap-3'
                        : 'contents'
                    }
                  >
                    <span
                      className={cn(
                        'flex size-9 shrink-0 items-center justify-center rounded-xl',
                        meta.chip
                      )}
                    >
                      <meta.icon className="size-4" />
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        item.type === 'QUICK_MESSAGE'
                          ? toggleQuick(item)
                          : openItem(item)
                      }
                      aria-expanded={
                        item.type === 'QUICK_MESSAGE'
                          ? expanded
                          : undefined
                      }
                      className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
                    >
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-slate-800">
                          {item.title}
                        </span>
                        {!item.read_at ? (
                          <span className="size-2 shrink-0 rounded-full bg-blue-600" />
                        ) : null}
                      </span>
                      <span className="text-sm text-slate-600">{item.body}</span>
                      <span className="flex items-center gap-1.5">
                        <span className="text-xs text-slate-400">
                          {timeAgo(item.created_at)}
                        </span>
                        {item.type === 'QUICK_MESSAGE' ? (
                          <ChevronDown
                            className={cn(
                              'size-4 shrink-0 text-slate-400 transition-transform',
                              expanded && 'rotate-180'
                            )}
                          />
                        ) : null}
                      </span>
                      {item.type === 'QUICK_MESSAGE' && item.image_url ? (
                        <img
                          src={item.image_url}
                          alt=""
                          className="mt-1 size-14 rounded-lg border border-slate-200 object-cover"
                        />
                      ) : null}
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      {!item.read_at ? (
                        <button
                          type="button"
                          onClick={() => markRead(item.id)}
                          aria-label="Marcar como lida"
                          title="Marcar como lida"
                          className="flex size-8 items-center justify-center rounded-lg text-blue-600 transition-colors hover:bg-blue-100 hover:text-blue-700 active:scale-95"
                        >
                          <Check className="size-4" />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        aria-label="Apagar notificação"
                        title="Apagar notificação"
                        className="flex size-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 active:scale-95"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>

                  {expanded ? (
                    <div className="flex flex-col gap-2 border-t border-slate-200 pt-2">
                      {item.body ? (
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                          {item.body}
                        </p>
                      ) : null}
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt="Imagem da mensagem"
                          className="h-auto w-full rounded-xl border border-slate-200"
                        />
                      ) : null}
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </Modal>
    </>
  )
}

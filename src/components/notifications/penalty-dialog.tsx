'use client'

import { useEffect, useState, useRef } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { markNotificationRead } from '@/actions/notifications'
import { usePostgresChanges } from '@/hooks/use-postgres-changes'
import type { NotificationItem } from '@/types/notifications'
import { Flame } from 'lucide-react'

type PenaltyDialogProps = {
  userId: string
  initialNotifications?: NotificationItem[]
}

export function PenaltyDialog({ userId, initialNotifications = [] }: PenaltyDialogProps) {
  const [activePenalty, setActivePenalty] = useState<NotificationItem | null>(null)
  const [pending, setPending] = useState(false)
  const acknowledgedRef = useRef(false)

  // Encontra notificações de penalidade não lidas da lista inicial
  useEffect(() => {
    const unreadPenalty = initialNotifications.find(
      (n) => n.type === 'PENALTY' && !n.read_at
    )
    if (unreadPenalty && !acknowledgedRef.current) {
      setActivePenalty(unreadPenalty)
    }
  }, [initialNotifications])

  // Realtime: nova notificação de penalidade chega
  usePostgresChanges<NotificationItem>({
    table: 'notifications',
    filter: `recipient_id=eq.${userId}`,
    onUpsert: (newNotif) => {
      if (newNotif.type === 'PENALTY' && !newNotif.read_at && !acknowledgedRef.current) {
        setActivePenalty(newNotif)
      }
    },
  })

  // Previne o ESC de fechar o modal enquanto a penalidade estiver ativa
  useEffect(() => {
    if (!activePenalty) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [activePenalty])

  // Parse penalty body: "-X pt(s) · Motivo: Y"
  function parsePenalty(body: string): { points: string; reason: string } {
    const pointsMatch = body.match(/^(-?\d+\s*pt\(s\))/)
    const reasonMatch = body.match(/Motivo:\s*(.+)$/)
    return {
      points: pointsMatch ? pointsMatch[1].trim() : body.split('·')[0]?.trim() ?? '',
      reason: reasonMatch ? reasonMatch[1].trim() : body.split('Motivo:')[1]?.trim() ?? body,
    }
  }

  async function handleAcknowledge() {
    if (!activePenalty || acknowledgedRef.current) return
    acknowledgedRef.current = true
    setPending(true)
    try {
      await markNotificationRead(activePenalty.id)
    } finally {
      setActivePenalty(null)
      setPending(false)
      acknowledgedRef.current = false
    }
  }

  if (!activePenalty) return null

  const { points, reason } = parsePenalty(activePenalty.body)

  return (
    <Modal
      open={true}
      onClose={() => {}} // Previne fechar modal quando clica fora do componente; apenas o botão de confirmar fecha
      title="Sua pontuação foi reduzida"
    >
      <div className="flex flex-col gap-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600">
          <Flame className="h-8 w-8 animate-bounce" />
        </div>

        <div className="space-y-1">
          <p className="text-2xl font-black text-red-600">{points}</p>
          <p className="text-sm font-medium text-slate-600">{reason}</p>
        </div>

        <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
          Esta redução foi aplicada por um administrador. Mantenha suas tarefas em dia para acumular novos pontos!
        </div>

        <Button
          onClick={handleAcknowledge}
          disabled={pending}
          className="w-full"
        >
          {pending ? 'Confirmando...' : 'Entendi'}
        </Button>
      </div>
    </Modal>
  )
}
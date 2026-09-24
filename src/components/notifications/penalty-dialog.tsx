'use client'

import { useEffect, useState } from 'react'
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

    useEffect(() => {
        const unreadPenalty = initialNotifications.find(
            (n) => n.type === 'PENALTY' && !n.read_at
        )
        if (unreadPenalty) {
            setActivePenalty(unreadPenalty)
        }
    }, [initialNotifications])

    usePostgresChanges<NotificationItem>({
        table: 'notifications',
        filter: `recipient_id=eq.${userId}`,
        onUpsert: (newNotif) => {
            if (newNotif.type === 'PENALTY' && !newNotif.read_at) {
                setActivePenalty(newNotif)
            }
        },
    })

    async function handleAcknowledge() {
        if (!activePenalty) return
        setPending(true)
        await markNotificationRead(activePenalty.id)
        setActivePenalty(null)
        setPending(false)
    }

    if (!activePenalty) return null

    return (
        <Modal
            open={!!activePenalty}
            onClose={() => { }} // Não fecha clicando fora/Esc para garantir leitura
            title="Sua pontuação foi reduzida"
        >
            <div className="flex flex-col gap-4 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600">
                    <Flame className="h-8 w-8 animate-bounce" />
                </div>

                <div className="space-y-1">
                    <p className="text-2xl font-black text-red-600">
                        {activePenalty.body.split('·')[0].trim()}
                    </p>
                    <p className="text-sm font-medium text-slate-600">
                        {activePenalty.body.includes('Motivo:')
                            ? activePenalty.body.split('Motivo:')[1].trim()
                            : activePenalty.body}
                    </p>
                </div>

                <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
                    Esta redução foi aplicada por um administrador. Mantenha suas tarefas em dia para acumular novos pontos!
                </div>

                <Button
                    onClick={handleAcknowledge}
                    disabled={pending}
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-bold"
                >
                    {pending ? 'Confirmando...' : 'Compreendi'}
                </Button>
            </div>
        </Modal>
    )
}
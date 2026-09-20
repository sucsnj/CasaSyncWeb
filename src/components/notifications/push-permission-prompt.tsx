'use client'

import { useState } from 'react'
import { Bell, Check, X } from 'lucide-react'
import { usePushNotifications } from '@/hooks/use-push-notifications'
import { Button } from '@/components/ui/button'

export function PushPermissionPrompt({ userId }: { userId: string | undefined }) {
  const [dismissed, setDismissed] = useState(false)
  usePushNotifications(userId)

  if (dismissed || !userId || typeof window === 'undefined') return null

  // Se já tem permissão concedida ou negada permanentemente, não mostra
  if (Notification.permission !== 'default') return null

  return (
    <div className="fixed bottom-24 left-4 right-4 md:left-auto md:right-4 md:bottom-24 md:w-80 z-50">
      <div className="bg-white rounded-xl border border-slate-200 shadow-lg p-4 animate-slide-up">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
            <Bell className="size-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-800">Ativar notificações</p>
            <p className="mt-1 text-sm text-slate-600">
              Receba avisos de tarefas, resgates e mensagens mesmo com o app fechado.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dispensar"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-3 flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => setDismissed(true)}
          >
            Agora não
          </Button>
          <Button
            className="flex-1 bg-blue-600 hover:bg-blue-700"
            onClick={async () => {
              const permission = await Notification.requestPermission()
              if (permission === 'granted') {
                setDismissed(true)
              }
            }}
          >
            <Check className="size-3.5 mr-1.5" />
            Ativar
          </Button>
        </div>
      </div>
    </div>
  )
}
'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createClient } from '@/utils/supabase/client'
import { AppSessionProvider, type AppSession } from '@/components/session/app-session'
import { AlertQueueOverlay } from '@/components/alerts/alert-queue-overlay'
import { DashboardNav } from '@/components/dashboard/dashboard-nav'
import {
  ADMIN_NAV_ITEMS,
  DEPENDENT_NAV_ITEMS,
} from '@/components/dashboard/nav-items'
import { PushNotificationsSetup } from '@/components/notifications/push-notifications-setup'
import { PushPermissionPrompt } from '@/components/notifications/push-permission-prompt'
import { RealtimeToastListener } from '@/components/notifications/realtime-toast-listener'
import { registerLoginDay } from '@/actions/stats'
import { useShellBundle } from '@/hooks/queries/use-shell'
import { QueryError } from '@/components/session/query-error'
import { PageSkeleton } from '@/components/ui/page-skeleton'
import { Button } from '@/components/ui/button'

function NavSkeleton() {
  return (
    <div
      className="fixed inset-x-0 top-0 z-50 flex h-16 items-center justify-between gap-3 bg-blue-800/40 px-4 md:px-6"
      aria-hidden="true"
    />
  )
}

/**
 * Shell da área do app — client-side. A página (shell) é estática; todo o
 * conteúdo que depende da sessão é montado aqui após a hidratação: sessão
 * (do storage), navegação, sino, castigo, comunicados e overlay de alertas.
 * Sem `await` no servidor e sem dados na primeira pintura do SSR.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), [])
  const [authUserId, setAuthUserId] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted) setAuthUserId(session?.user?.id ?? null)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUserId(session?.user?.id ?? null)
    })
    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [supabase])

  useEffect(() => {
    if (authUserId === null) window.location.replace('/login')
  }, [authUserId])

  const { data: shell, isError, refetch } = useShellBundle(
    authUserId ?? null
  )

  const appSession: AppSession | null = useMemo(
    () =>
      shell
        ? {
            userId: shell.userId,
            role: shell.role,
            houseId: shell.houseId,
            houseName: shell.houseName,
          }
        : null,
    [shell]
  )

  // Login do dia para o DEPENDENT (idempotente por dia no servidor — refetch do shell é inofensivo).
  useEffect(() => {
    if (!shell || shell.role === 'ADMIN' || !shell.houseId) return
    void registerLoginDay(shell.houseId, shell.userId).catch(() => undefined)
  }, [shell])

  if (authUserId === undefined) {
    return (
      <>
        <NavSkeleton />
        <div className="p-4 pt-20 md:p-6 md:pt-24">
          <PageSkeleton cards={3} />
        </div>
      </>
    )
  }

  if (authUserId === null) {
    return (
      <>
        <NavSkeleton />
        <div className="flex flex-col items-center gap-4 p-8 pt-28 text-center">
          <h2 className="text-lg font-semibold text-slate-800">Sua sessão expirou</h2>
          <p className="max-w-md text-sm text-slate-600">
            Entre novamente para continuar.
          </p>
          <Button onClick={() => window.location.replace('/login')}>
            Voltar para o login
          </Button>
        </div>
      </>
    )
  }

  if (!shell || !appSession) {
    return (
      <>
        <NavSkeleton />
        <div className="flex flex-col gap-6 p-4 pt-20 md:p-6 md:pt-24">
          {isError ? (
            <QueryError onRetry={() => void refetch()} />
          ) : (
            <PageSkeleton cards={3} />
          )}
        </div>
      </>
    )
  }

  const isAdmin = appSession.role === 'ADMIN'

  return (
    <AppSessionProvider session={appSession}>
      <DashboardNav
        items={isAdmin ? ADMIN_NAV_ITEMS : DEPENDENT_NAV_ITEMS}
        userName={shell.profile.full_name}
        avatarUrl={shell.profile.avatar_url}
        points={isAdmin ? undefined : shell.profile.points}
        userId={shell.userId}
        notifications={shell.notifications}
        role={shell.role}
        quickMessageSettings={shell.quickMessageSettings}
        hasClaimableAchievement={shell.hasClaimableAchievement}
        punishment={shell.punishment}
        activeHouseId={shell.houseId}
        houseNames={shell.houseNames}
        houseName={shell.houseName}
      />
      <RealtimeToastListener userId={appSession.userId} />
      <PushNotificationsSetup userId={appSession.userId} />
      <PushPermissionPrompt userId={appSession.userId} />
      {!isAdmin ? (
        <AlertQueueOverlay
          userId={appSession.userId}
          initialQueue={shell.dueComunicados}
          initialNotifications={shell.notifications}
        />
      ) : null}
      {children}
    </AppSessionProvider>
  )
}

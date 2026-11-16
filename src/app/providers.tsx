'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { del } from 'idb-keyval'
import { createQueryClient } from '@/lib/query/query-client'
import {
  MAX_AGE,
  PERSIST_KEY,
  createIdbPersister,
  shouldDehydrateQuery,
} from '@/lib/query/persist'
import { useSessionScope } from '@/lib/query/session-scope'
import { OfflineBanner } from '@/components/ui/offline-banner'

const persister = createIdbPersister()
const LAST_USER_KEY = 'casasync:last-user'

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => createQueryClient())
  const scope = useSessionScope()
  const [purgedUserId, setPurgedUserId] = useState<string | null | undefined>(undefined)

  // Só depois do auth resolver (userId ou null confirmado) avaliamos a troca
  // de conta e descartamos o IndexedDB/memória antiga — e só então liberamos
  // a árvore de filhos sob o provider persistente.
  useEffect(() => {
    if (!scope.ready) return
    const current = scope.userId ?? 'anonymous'

    let last: string | null = null
    try {
      last = window.localStorage.getItem(LAST_USER_KEY)
    } catch {
      last = null
    }
    const stale = last !== current

    ;(async () => {
      try {
        if (stale) {
          // Limpa disco antes de qualquer restore; memória em seguida.
          await del(PERSIST_KEY).catch(() => undefined)
          queryClient.clear()
          try {
            window.localStorage.setItem(LAST_USER_KEY, current)
          } catch {
            // storage bloqueado — descarte cobre via buster no provider
          }
        }
      } finally {
        setPurgedUserId(current)
      }
    })()
  }, [scope.ready, scope.userId, queryClient])

  // Enquanto a sessão estiver resolvendo ou o purge pendente, nada filho
  // renderiza — nem o provider persistente.
  if (purgedUserId === undefined) {
    return null
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: MAX_AGE,
        buster: `casasync-v1:${purgedUserId}`,
        dehydrateOptions: { shouldDehydrateQuery },
      }}
    >
      <OfflineBanner />
      {children}
    </PersistQueryClientProvider>
  )
}

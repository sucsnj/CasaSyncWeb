'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { del } from 'idb-keyval'
import { createQueryClient } from '@/lib/query/query-client'
import {
  CACHE_BUSTER,
  MAX_AGE,
  PERSIST_KEY,
  createIdbPersister,
  shouldDehydrateQuery,
} from '@/lib/query/persist'
import { useSessionScope } from '@/lib/query/session-scope'
import { OfflineBanner } from '@/components/ui/offline-banner'

const persister = createIdbPersister()
const LAST_USER_KEY = 'casasync:last-user'

function SessionCachePurge() {
  const queryClient = useQueryClient()
  const scope = useSessionScope()

  useEffect(() => {
    if (!scope.ready) return
    const current = scope.userId ?? 'anonymous'
    const last = window.localStorage.getItem(LAST_USER_KEY)
    if (last !== current) {
      // Conta diferente da última sessão neste dispositivo: descarta a
      // memória e o bucket persistido. O buster/MAX_AGE também cobre
      // instalações antigas e alterações de versão do cache.
      queryClient.clear()
      del(PERSIST_KEY).catch(() => undefined)
      window.localStorage.setItem(LAST_USER_KEY, current)
    }
  }, [scope, queryClient])

  return null
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => createQueryClient())

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: MAX_AGE,
        buster: CACHE_BUSTER,
        dehydrateOptions: { shouldDehydrateQuery },
      }}
    >
      <SessionCachePurge />
      <OfflineBanner />
      {children}
    </PersistQueryClientProvider>
  )
}

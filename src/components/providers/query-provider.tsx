'use client'

import { useState } from 'react'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import {
  PERSIST_KEY,
  PERSIST_MAX_AGE_MS,
  queryPersister,
} from '@/lib/persist-cache'

/**
 * Provider global do React Query — o cache de cliente do app.
 *
 * **Por que `useState` com inicializador:** o `QueryClient` é criado **uma vez**
 * por sessão do browser. Recriá-lo a cada render apagaria o cache e trocaria a
 * navegação "instantânea" por um cold load em toda troca de rota.
 *
 * **Defaults pensados para este app (local-first):**
 * - `staleTime: 5min` — a janela `/tasks` → `/rewards` → `/tasks` **não**
 *   refaz requisição: o dado já está no cache e é servido na hora (SWR).
 * - `gcTime: 5min` — o cache sobrevive a navegações curtas, sem crescer sem
 *   limite.
 * - `refetchOnWindowFocus: false` — por padrão **não** revalida ao voltar para
 *   a aba: quem é crítico (saldo/pontos) marca `refetchOnWindowFocus: true`
 *   na própria query, e o Realtime já cobre o que é vivo.
 * - `retry: 1` — uma nova tentativa só; erro de rede não deve travar a tela.
 * - Persistência IndexedDB (`casasync-rq-v1`, máx. 5 min): o cache sobrevive a
 *   F5/reabertura de aba/app — o shell renderiza com o dado que a sessão
 *   tirou antes do encerramento e revalida em background (SWR). Apenas as
 *   queries das 4 telas são persitidas (não envelopes, não o shell).
 *   O sign-out apaga o blob **e** o cache em memória (`purgePersistedCache`).
 *
 * O shell (badges da nav, ícone de castigo, comunicados, sino) **continua no
 * servidor** (RSC) e se atualiza com `router.refresh()` — ele é renderizado
 * fora do cache do cliente, por isso não entra aqui.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5,
            gcTime: 1000 * 60 * 5,
            refetchOnWindowFocus: false,
            retry: 1,
            refetchOnReconnect: true,
          },
          mutations: {
            retry: 0,
          },
        },
      })
  )

  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister: queryPersister,
        maxAge: PERSIST_MAX_AGE_MS,
        buster: PERSIST_KEY,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) =>
            ['tasks', 'rewards', 'achievements', 'chest'].includes(
              String(query.queryKey[0] ?? '')
            ),
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  )
}

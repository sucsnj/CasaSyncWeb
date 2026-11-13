'use client'

import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

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
 * - `gcTime: 30min` — o cache sobrevive a navegações curtas (ir ao baú e
 *   voltar), mas não cresce sem limite.
 * - `refetchOnWindowFocus: false` — por padrão **não** revalida ao voltar para
 *   a aba: quem é crítico (saldo/pontos) marca `refetchOnWindowFocus: true`
 *   na própria query, e o Realtime já cobre o que é vivo.
 * - `retry: 1` — uma nova tentativa só; erro de rede não deve travar a tela.
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
            gcTime: 1000 * 60 * 30,
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

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

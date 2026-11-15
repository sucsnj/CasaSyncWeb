import { get, set, del } from 'idb-keyval'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import type { Persister } from '@tanstack/react-query-persist-client'

/**
 * Persister do cache do React Query no IndexedDB (`casasync-rq-v1`).
 *
 * **Por que uma lib e não código no provider:** o sign-out precisa apagar o
 * blob sem depender do componente que tem o `useQueryClient` — e o provider
 * cria tudo uma vez. A chave é única para o app: se o schema do cache mudar,
 * bumpe `PERSIST_KEY` — nada de migração de dados antigos (eles expiram pelo
 * `maxAge` de 5 min).
 *
 * **SSR-safe:** `indexedDB` só é tocado quando uma operação acontece (o
 * `idb-keyval` instancia o store por demanda); mesmo assim, fora do browser
 * o persister vira noop e nada persiste.
 *
 * **Privacidade:** o sign-out DEVE chamar `purgePersistedCache()` — sem isso,
 * o próximo login no mesmo navegador herdaria o cache do usuário anterior.
 * Falha de IndexedDB (modo privado, quota) nunca derruba a app: o catch devolve
 * null/ignora e a sessão fica só com o cache em memória.
 */

export const PERSIST_KEY = 'casasync-rq-v1'

/** Janela única: staleTime, gcTime e maxAge do persist entram em 5 min. */
export const PERSIST_MAX_AGE_MS = 1000 * 60 * 5

const persistedStorage =
  typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined'
    ? {
        getItem: async (key: string) => {
          try {
            const value = await get(key)
            return typeof value === 'string' ? value : null
          } catch {
            return null
          }
        },
        setItem: async (key: string, value: string) => {
          try {
            await set(key, value)
          } catch {
            // Quota excedida ou IndexedDB bloqueado: ignora — o cache em memória cobre.
          }
        },
        removeItem: async (key: string) => {
          try {
            await del(key)
          } catch {
            // Best-effort: falha na remoção não retém dados além do maxAge.
          }
        },
      }
    : undefined

export const queryPersister: Persister = createAsyncStoragePersister({
  storage: persistedStorage,
  key: PERSIST_KEY,
  throttleTime: 1000,
})

/** Remove o blob persistido — chamar no sign-out, obrigatoriamente. */
export async function purgePersistedCache(): Promise<void> {
  try {
    await del(PERSIST_KEY)
  } catch {
    // Best-effort.
  }
}

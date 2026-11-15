import { del, get, set } from 'idb-keyval'
import type {
  DehydrateOptions,
} from '@tanstack/query-core'
import type {
  PersistedClient,
  Persister,
} from '@tanstack/query-persist-client-core'

export const PERSIST_KEY = 'casasync:qc'
export const CACHE_BUSTER = 'casasync-v1'
export const MAX_AGE = 24 * 60 * 60_000

// Domínios que jamais devem persistir em disco: pedidos de confirmação de
// comunicados (segurança infantil) e castigos ativos (não estão na
// publication Realtime; dado obsoleto alteraria a experiência do dependente).
const PERSIST_EXCLUDE = new Set(['comunicados', 'punishments'])

export const shouldDehydrateQuery: NonNullable<
  DehydrateOptions['shouldDehydrateQuery']
> = (query) =>
  query.state.status === 'success' &&
  !(typeof query.queryKey[2] === 'string' && PERSIST_EXCLUDE.has(query.queryKey[2]))

export function createIdbPersister(key: string = PERSIST_KEY): Persister {
  return {
    async persistClient(client: PersistedClient) {
      await set(key, client)
    },
    async restoreClient() {
      const stored = await get<PersistedClient>(key)
      return stored ?? undefined
    },
    async removeClient() {
      await del(key)
    },
  }
}

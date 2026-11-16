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
// `shell` (sino com comunicados pendentes) e `houses` (PIN de convite) também ficam de fora.
const PERSIST_EXCLUDE_ROOT = new Set(['shell', 'houses', 'comunicados'])
const PERSIST_EXCLUDE_LEAF = new Set(['comunicados', 'punishments'])

export const shouldDehydrateQuery: NonNullable<
  DehydrateOptions['shouldDehydrateQuery']
> = (query) => {
  if (query.state.status !== 'success') return false
  // O shell carrega comunicados pendentes — jamais persiste.
  if (typeof query.queryKey[0] === 'string' && PERSIST_EXCLUDE_ROOT.has(query.queryKey[0])) {
    return false
  }
  return !(
    typeof query.queryKey[2] === 'string' && PERSIST_EXCLUDE_LEAF.has(query.queryKey[2])
  )
}

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

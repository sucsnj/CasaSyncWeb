import {
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react'

export type UseExpandedIdsOptions<T extends string = string> = {
  /**
   * Chave do `localStorage` usada para persistir os ids expandidos.
   * Sem ela, o estado fica apenas em memória.
   */
  storageKey?: string
  /**
   * Ids inicialmente expandidos quando ainda não há estado salvo.
   * Apenas a primeira instância que cria o store de uma `storageKey` define
   * esse valor; depois disso vale o que estiver persistido.
   */
  initialIds?: Iterable<T>
}

export type UseExpandedIdsResult<T extends string = string> = {
  /** Conjunto de ids atualmente expandidos. */
  expandedIds: ReadonlySet<T>
  /** `true` após a primeira hidratação no cliente (evita flash de estado SSR). */
  isHydrated: boolean
  isExpanded: (id: T) => boolean
  /** Alterna um id (expande se recolhido, recolhe se expandido). */
  toggle: (id: T) => void
  expand: (id: T) => void
  collapse: (id: T) => void
  setExpanded: (id: T, expanded: boolean) => void
  /** Adiciona vários ids ao conjunto expandido (mescla com o estado atual). */
  expandAll: (ids: Iterable<T>) => void
  /** Recolhe todos. */
  collapseAll: () => void
  /** Remove a persistência e zera o estado (volta ao estado inicial). */
  clear: () => void
}

type ExpandedStore = {
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => string[]
  set: (ids: string[]) => void
}

// Congelado: é usado como snapshot estável e nunca deve ser mutado.
const EMPTY_IDS = Object.freeze([]) as unknown as string[]

function getServerSnapshot(): string[] {
  return EMPTY_IDS
}

function parseIds(raw: string | null): string[] {
  if (!raw) return EMPTY_IDS
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return EMPTY_IDS
    return parsed.filter((id): id is string => typeof id === 'string')
  } catch {
    return EMPTY_IDS
  }
}

function createMemoryStore(initialIds: Iterable<string> = []): ExpandedStore {
  const initial = [...initialIds]
  let value: string[] = initial.length > 0 ? initial : EMPTY_IDS
  const listeners = new Set<() => void>()

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot() {
      return value
    },
    set(ids) {
      value = ids
      listeners.forEach((listener) => listener())
    },
  }
}

// Um store por chave, compartilhado entre instâncias do hook. Isso mantém
// componentes diferentes com a mesma `storageKey` em sincronia.
const localStorageStores = new Map<string, ExpandedStore>()

function createLocalStorageStore(
  storageKey: string,
  initialIds: Iterable<string> = []
): ExpandedStore {
  const initial = [...initialIds]
  const defaultIds = initial.length > 0 ? initial : EMPTY_IDS
  const listeners = new Set<() => void>()
  let cachedRaw: string | null = null
  let cachedIds: string[] = defaultIds
  // Usado quando o `localStorage` não está disponível (modo privado/cota):
  // mantém o estado em memória sem perder o que foi alternado.
  let memoryOverride: string[] | null = null
  // Evita apagar o store enquanto um componente está entre render e subscribe.
  let evictionTimer: ReturnType<typeof setTimeout> | null = null

  function read(): string[] {
    if (typeof window === 'undefined') return EMPTY_IDS
    if (memoryOverride) return memoryOverride

    let raw: string | null = null
    try {
      raw = window.localStorage.getItem(storageKey)
    } catch {
      // localStorage inacessível: preserva o último estado conhecido.
      return cachedIds
    }

    if (raw === cachedRaw) return cachedIds
    cachedRaw = raw
    cachedIds = raw === null ? defaultIds : parseIds(raw)
    return cachedIds
  }

  function notify() {
    listeners.forEach((listener) => listener())
  }

  function handleStorage(event: StorageEvent) {
    if (event.key !== storageKey) return
    memoryOverride = null
    notify()
  }

  return {
    subscribe(listener) {
      if (evictionTimer) {
        clearTimeout(evictionTimer)
        evictionTimer = null
      }
      listeners.add(listener)
      if (listeners.size === 1 && typeof window !== 'undefined') {
        window.addEventListener('storage', handleStorage)
      }
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) {
          if (typeof window !== 'undefined') {
            window.removeEventListener('storage', handleStorage)
          }
          // Sem assinantes, libera o store. O dado continua no localStorage e
          // é relido quando o componente remontar. Se o localStorage falhou
          // (memoryOverride ativo), mantém o store para não perder o estado.
          // O timer evita apagar o store no intervalo entre render e subscribe.
          if (!memoryOverride) {
            if (evictionTimer) clearTimeout(evictionTimer)
            evictionTimer = setTimeout(() => {
              evictionTimer = null
              if (listeners.size === 0 && !memoryOverride) {
                localStorageStores.delete(storageKey)
              }
            }, 0)
          }
        }
      }
    },
    getSnapshot: read,
    set(ids) {
      const serialized = JSON.stringify(ids)
      try {
        if (ids.length === 0) {
          window.localStorage.removeItem(storageKey)
        } else {
          window.localStorage.setItem(storageKey, serialized)
        }
        memoryOverride = null
        cachedRaw = ids.length === 0 ? null : serialized
        cachedIds = ids.length === 0 ? defaultIds : ids
      } catch {
        // Sem localStorage: segue apenas em memória.
        memoryOverride = ids
      }
      notify()
    },
  }
}

function getStore(
  storageKey: string,
  initialIds: Iterable<string> = []
): ExpandedStore {
  let store = localStorageStores.get(storageKey)
  if (!store) {
    store = createLocalStorageStore(storageKey, initialIds)
    localStorageStores.set(storageKey, store)
  }
  return store
}

/**
 * Estado genérico de colapso/expansão por id (cards, listas, seções).
 *
 * Mantém um `Set` de ids expandidos e, quando recebe `storageKey`, persiste
 * no `localStorage` do navegador. A leitura usa `useSyncExternalStore`, então
 * o SSR renderiza o estado recolhido e o cliente reidrata sem divergência.
 *
 * Uso:
 *   const { isExpanded, toggle } = useExpandedIds({
 *     storageKey: `casasync:expanded:tasks:${houseId}`,
 *   })
 */
export function useExpandedIds<T extends string = string>({
  storageKey,
  initialIds = [],
}: UseExpandedIdsOptions<T> = {}): UseExpandedIdsResult<T> {
  const hasStorage = Boolean(storageKey && storageKey.trim() !== '')
  const [memoryStore] = useState<ExpandedStore | null>(() =>
    hasStorage ? null : createMemoryStore(initialIds)
  )
  const store: ExpandedStore = hasStorage
    ? getStore(storageKey as string, initialIds)
    : (memoryStore ?? createMemoryStore(initialIds))

  const ids = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    getServerSnapshot
  )

  // Hidratação: falso no servidor, verdadeiro no cliente após a montagem.
  const isHydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )

  const expandedIds = useMemo(() => new Set<T>(ids as T[]), [ids])

  const isExpanded = useCallback((id: T) => expandedIds.has(id), [expandedIds])

  const toggle = useCallback(
    (id: T) => {
      const next = new Set<T>(store.getSnapshot() as T[])
      if (next.has(id)) next.delete(id)
      else next.add(id)
      store.set([...next])
    },
    [store]
  )

  const expand = useCallback(
    (id: T) => {
      const current = store.getSnapshot() as T[]
      if (current.includes(id)) return
      store.set([...current, id])
    },
    [store]
  )

  const collapse = useCallback(
    (id: T) => {
      const current = store.getSnapshot() as T[]
      if (!current.includes(id)) return
      store.set(current.filter((currentId) => currentId !== id))
    },
    [store]
  )

  const setExpanded = useCallback(
    (id: T, expanded: boolean) => {
      const current = store.getSnapshot() as T[]
      if (current.includes(id) === expanded) return
      store.set(
        expanded
          ? [...current, id]
          : current.filter((currentId) => currentId !== id)
      )
    },
    [store]
  )

  const expandAll = useCallback(
    (nextIds: Iterable<T>) => {
      const current = store.getSnapshot() as T[]
      const merged = new Set<T>(current)
      for (const id of nextIds) merged.add(id)
      store.set([...merged])
    },
    [store]
  )

  const collapseAll = useCallback(() => {
    store.set([])
  }, [store])

  const clear = useCallback(() => {
    if (hasStorage) {
      try {
        window.localStorage.removeItem(storageKey as string)
      } catch {
        // Ignora: segue apenas em memória.
      }
    }
    store.set([])
  }, [store, hasStorage, storageKey])

  return {
    expandedIds,
    isHydrated,
    isExpanded,
    toggle,
    expand,
    collapse,
    setExpanded,
    expandAll,
    collapseAll,
    clear,
  }
}

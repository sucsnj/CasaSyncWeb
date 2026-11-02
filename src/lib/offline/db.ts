/**
 * Wrapper minimo de IndexedDB (sem dependencia externa).
 *
 * Bancos antigos/outra aba: o `open` e memoizado por modulo. Todas as funcoes
 * sao no-op/retorno vazio quando IndexedDB nao existe (SSR), para o modulo
 * poder ser importado sem quebrar o build.
 */

export const DB_NAME = 'casasync-pwa'
export const DB_VERSION = 1

export const STORE_SNAPSHOT = 'snapshot'
export const STORE_OUTBOX = 'outbox'
export const STORE_META = 'meta'

let dbPromise: Promise<IDBDatabase> | null = null

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB indisponível.'))
  }

  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result

      if (!db.objectStoreNames.contains(STORE_SNAPSHOT)) {
        db.createObjectStore(STORE_SNAPSHOT)
      }

      if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
        const outbox = db.createObjectStore(STORE_OUTBOX, {
          keyPath: 'operationId',
        })
        outbox.createIndex('createdAt', 'createdAt')
      }

      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META)
      }
    }

    request.onsuccess = () => {
      const db = request.result
      // Se outra aba abrir uma versao nova, libera o banco em vez de travar.
      db.onversionchange = () => db.close()
      resolve(db)
    }
    request.onerror = () =>
      reject(request.error ?? new Error('Falha ao abrir o IndexedDB.'))
    request.onblocked = () =>
      reject(new Error('IndexedDB bloqueado por outra aba.'))
  })

  return dbPromise
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('Falha de leitura no IndexedDB.'))
  })
}

export async function idbGet<T>(
  storeName: string,
  key: IDBValidKey
): Promise<T | undefined> {
  try {
    const db = await openDatabase()
    const tx = db.transaction(storeName, 'readonly')
    return await requestToPromise(tx.objectStore(storeName).get(key) as IDBRequest<
      T | undefined
    >)
  } catch {
    return undefined
  }
}

export async function idbPut(
  storeName: string,
  value: unknown,
  key?: IDBValidKey
): Promise<void> {
  const db = await openDatabase()
  const tx = db.transaction(storeName, 'readwrite')
  const store = tx.objectStore(storeName)

  if (key === undefined) store.put(value)
  else store.put(value, key)

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () =>
      reject(tx.error ?? new Error('Falha de escrita no IndexedDB.'))
    tx.onabort = () =>
      reject(tx.error ?? new Error('Escrita no IndexedDB cancelada.'))
  })
}

export async function idbDelete(
  storeName: string,
  key: IDBValidKey
): Promise<void> {
  const db = await openDatabase()
  const tx = db.transaction(storeName, 'readwrite')
  tx.objectStore(storeName).delete(key)

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () =>
      reject(tx.error ?? new Error('Falha ao remover do IndexedDB.'))
    tx.onabort = () =>
      reject(tx.error ?? new Error('Remoção no IndexedDB cancelada.'))
  })
}

export async function idbGetAll<T>(
  storeName: string,
  indexName?: string
): Promise<T[]> {
  try {
    const db = await openDatabase()
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const source = indexName ? store.index(indexName) : store
    return await requestToPromise(source.getAll() as IDBRequest<T[]>)
  } catch {
    return []
  }
}

export async function clearOfflineData(): Promise<void> {
  if (typeof indexedDB === 'undefined') return

  try {
    const db = await openDatabase()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(
        [STORE_SNAPSHOT, STORE_OUTBOX, STORE_META],
        'readwrite'
      )
      tx.objectStore(STORE_SNAPSHOT).clear()
      tx.objectStore(STORE_OUTBOX).clear()
      tx.objectStore(STORE_META).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () =>
        reject(tx.error ?? new Error('Falha ao limpar o IndexedDB.'))
      tx.onabort = () =>
        reject(tx.error ?? new Error('Limpeza do IndexedDB cancelada.'))
    })
  } catch {
    // Logout nunca deve falhar por causa do cache offline.
  }
}

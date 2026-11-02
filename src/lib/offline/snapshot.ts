/**
 * Snapshot de leitura (ultimo estado visto online) + metadados do usuario.
 *
 * O snapshot e gravado pela Fase 2 (`/api/offline/snapshot`); aqui ficam apenas
 * o armazenamento e a checagem de validade. Nunca inclui credenciais/PIN.
 */

import { idbDelete, idbGet, idbPut } from './db'
import { STORE_META, STORE_SNAPSHOT } from './db'

export const SNAPSHOT_VERSION = 1
export const SNAPSHOT_MAX_AGE_MS = 12 * 60 * 60 * 1000

const SNAPSHOT_KEY = 'current'
const META_KEY = 'current'

export type OfflineSnapshotData = {
  tasks?: unknown[]
  assignees?: unknown[]
  rewards?: unknown[]
  redemptions?: unknown[]
  suggestions?: unknown[]
  dependents?: unknown[]
  creatorNames?: Record<string, string>
  dayStartIso?: string
  monthStartIso?: string
  textLimits?: unknown
  points?: number
}

export type OfflineSnapshot<T = OfflineSnapshotData> = {
  version: number
  generatedAt: string
  userId: string
  houseId: string | null
  role: 'ADMIN' | 'DEPENDENT'
  data: T
}

export type OfflineMeta = {
  userId: string
  houseId: string | null
  role: 'ADMIN' | 'DEPENDENT'
  syncedAt: string | null
}

export async function saveSnapshot<T>(
  snapshot: OfflineSnapshot<T>
): Promise<void> {
  await idbPut(STORE_SNAPSHOT, snapshot, SNAPSHOT_KEY)
}

export async function readSnapshot<T = unknown>(): Promise<
  OfflineSnapshot<T> | null
> {
  const snapshot = await idbGet<OfflineSnapshot<T>>(
    STORE_SNAPSHOT,
    SNAPSHOT_KEY
  )
  return snapshot ?? null
}

export async function clearSnapshot(): Promise<void> {
  await idbDelete(STORE_SNAPSHOT, SNAPSHOT_KEY)
}

export function isSnapshotStale(
  snapshot: Pick<OfflineSnapshot, 'generatedAt'>,
  now = Date.now()
): boolean {
  const generatedAt = new Date(snapshot.generatedAt).getTime()
  if (!Number.isFinite(generatedAt)) return true
  return now - generatedAt > SNAPSHOT_MAX_AGE_MS
}

export async function saveOfflineMeta(meta: OfflineMeta): Promise<void> {
  await idbPut(STORE_META, meta, META_KEY)
}

export async function readOfflineMeta(): Promise<OfflineMeta | null> {
  const meta = await idbGet<OfflineMeta>(STORE_META, META_KEY)
  return meta ?? null
}

export async function clearOfflineMeta(): Promise<void> {
  await idbDelete(STORE_META, META_KEY)
}

/**
 * Busca o snapshot mais recente no servidor e grava no IndexedDB.
 * Retorna `null` se a rede falhar ou a sessao expirar — o chamador decide
 * se avisa o usuario.
 */
export async function refreshOfflineSnapshot(): Promise<
  OfflineSnapshot<OfflineSnapshotData> | null
> {
  if (typeof fetch === 'undefined') return null

  try {
    const response = await fetch('/api/offline/snapshot', {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
    })

    if (response.status === 401 || response.redirected) return null
    if (!response.ok) return null

    const payload = (await response.json()) as {
      userId?: string
      role?: 'ADMIN' | 'DEPENDENT'
      houseId?: string | null
      generatedAt?: string
      data?: OfflineSnapshotData
    }

    if (!payload.userId || !payload.role || !payload.generatedAt) return null

    const snapshot: OfflineSnapshot<OfflineSnapshotData> = {
      version: SNAPSHOT_VERSION,
      generatedAt: payload.generatedAt,
      userId: payload.userId,
      houseId: payload.houseId ?? null,
      role: payload.role,
      data: payload.data ?? {},
    }

    await saveSnapshot(snapshot)
    await saveOfflineMeta({
      userId: snapshot.userId,
      houseId: snapshot.houseId,
      role: snapshot.role,
      syncedAt: snapshot.generatedAt,
    })

    return snapshot
  } catch {
    return null
  }
}

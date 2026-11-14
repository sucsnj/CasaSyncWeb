import { unstable_cache, updateTag } from 'next/cache'
import { cache } from 'react'
import { createAdminClient } from '@/utils/supabase/admin'
import { houseAttachmentBytes } from '@/utils/attachment-usage'
import type { Tables } from '@/types/database'

/**
 * Cache de servidor por CASA (Next Data Cache, multi-request e multi-instância
 * em deploys serverless). Só leituras: nada de cookies/headers e nenhum efeito
 * colateral dentro dos escopos cacheados — tudo é `houseId` como argumento
 * serializável e service-role por dentro (ADR-0006).
 *
 * **Regra de ouro: `revalidatePath()` NÃO invalida este cache** — ele só purga
 * o Router/RSC cache. A consistência do Data Cache depende 100% de
 * `updateTag()` dentro de Server Actions. Toda action que escreve em `tasks`,
 * `rewards`, `chest_items`, `house_settings`, `house_members` ou `profiles`
 * deve chamar `invalidateHouseCache(houseId, ...escopos)` no caminho de
 * sucesso. Escrita fora de action fica stale até o TTL de fallback (300s) que
 * todas as entradas têm.
 *
 * Dois níveis:
 * - `unstable_cache` (cross-request, tags por casa) — invalidado com
 *   `updateTag` nas Server Actions;
 * - `React.cache` por cima (dedupe dentro do request) — as telas chamam as
 *   mesmas leituras por vários caminhos (layout → página → action).
 *
 * Escopos nunca sem `houseId` (isolamento multi-tenant). TTL 300s de fallback
 * (SWR) limita a staleness de escrita invisível a 5 minutos — o resto da
 * semântica de tags (expiração imediata por `updateTag`) continua como antes.
 */

export const dataTags = {
  tasks: (houseId: string) => `tasks:${houseId}`,
  rewards: (houseId: string) => `rewards:${houseId}`,
  chest: (houseId: string) => `chest:${houseId}`,
  houseSettings: (houseId: string) => `house-settings:${houseId}`,
  houseMembers: (houseId: string) => `house-members:${houseId}`,
  chestStorage: (houseId: string) => `storage:chest:${houseId}`,
} as const

export type HouseMemberDirectory = {
  members: { profileId: string; role: 'ADMIN' | 'DEPENDENT' }[]
  nameById: Record<string, string>
}

export type RewardsHouseData = {
  rewards: Tables<'rewards'>[]
  redemptions: Tables<'reward_redemptions'>[]
  suggestions: Tables<'reward_suggestions'>[]
  nameById: Record<string, string>
}

const TASKS_ORDER = 'created_at'

export const getCachedTasksForHouse = cache((houseId: string) =>
  unstable_cache(
    async (id: string): Promise<Tables<'tasks'>[]> => {
      const admin = createAdminClient()
      const { data, error } = await admin
        .from('tasks')
        .select('*')
        .eq('house_id', id)
        .order(TASKS_ORDER, { ascending: false })
      if (error) throw new Error('Falha ao ler as tarefas da casa.')
      return data ?? []
    },
    ['casasync:tasks'],
    { tags: [dataTags.tasks(houseId)], revalidate: 300 }
  )(houseId)
)

export const getCachedRewardsForHouse = cache((houseId: string) =>
  unstable_cache(
    async (id: string): Promise<RewardsHouseData> => {
      const admin = createAdminClient()
      const [rewardsRes, redemptionsRes, suggestionsRes, membersRes] =
        await Promise.all([
          admin
            .from('rewards')
            .select('*')
            .eq('house_id', id)
            .order('created_at', { ascending: true }),
          admin
            .from('reward_redemptions')
            .select('*')
            .eq('house_id', id)
            .order('created_at', { ascending: true }),
          admin
            .from('reward_suggestions')
            .select('*')
            .eq('house_id', id)
            .order('created_at', { ascending: false }),
          admin
            .from('house_members')
            .select('profile_id')
            .eq('house_id', id)
            .eq('role', 'DEPENDENT'),
        ])

      if (
        rewardsRes.error ||
        redemptionsRes.error ||
        suggestionsRes.error ||
        membersRes.error
      ) {
        throw new Error('Falha ao ler as recompensas da casa.')
      }

      const profileIds = [
        ...new Set(
          [
            ...(membersRes.data ?? []).map((member) => member.profile_id),
            ...(redemptionsRes.data ?? []).map((row) => row.profile_id),
            ...(suggestionsRes.data ?? []).map((row) => row.profile_id),
          ].filter(Boolean)
        ),
      ]

      let nameById: Record<string, string> = {}
      if (profileIds.length > 0) {
        const { data: profiles } = await admin
          .from('profiles')
          .select('id, full_name')
          .in('id', profileIds)
        nameById = Object.fromEntries(
          (profiles ?? []).map((profile) => [
            profile.id,
            profile.full_name ?? 'Sem nome',
          ])
        )
      }

      return {
        rewards: rewardsRes.data ?? [],
        redemptions: redemptionsRes.data ?? [],
        suggestions: suggestionsRes.data ?? [],
        nameById,
      }
    },
    ['casasync:rewards'],
    { tags: [dataTags.rewards(houseId)], revalidate: 300 }
  )(houseId)
)

export const getCachedChestItemsForHouse = cache((houseId: string) =>
  unstable_cache(
    async (id: string): Promise<Tables<'chest_items'>[]> => {
      const admin = createAdminClient()
      const { data, error } = await admin
        .from('chest_items')
        .select('*')
        .eq('house_id', id)
        .order('created_at', { ascending: false })
      if (error) throw new Error('Falha ao ler os itens do baú.')
      return data ?? []
    },
    ['casasync:chest-items'],
    { tags: [dataTags.chest(houseId)], revalidate: 300 }
  )(houseId)
)

export const getCachedChestItemsByIds = cache(
  (houseId: string, ids: string[]) =>
    unstable_cache(
      async (id: string, keys: string[]): Promise<Tables<'chest_items'>[]> => {
        if (keys.length === 0) return []
        const admin = createAdminClient()
        const { data, error } = await admin
          .from('chest_items')
          .select('*')
          .in('id', keys)
        if (error) throw new Error('Falha ao ler os itens do baú.')
        return data ?? []
      },
      ['casasync:chest-items-by-ids'],
      { tags: [dataTags.chest(houseId)], revalidate: 300 }
    )(houseId, ids)
)

export const getCachedHouseMembers = cache((houseId: string) =>
  unstable_cache(
    async (id: string): Promise<HouseMemberDirectory> => {
      const admin = createAdminClient()
      const { data: members } = await admin
        .from('house_members')
        .select('profile_id, role')
        .eq('house_id', id)

      const rows = (members ?? []) as {
        profile_id: string
        role: 'ADMIN' | 'DEPENDENT'
      }[]
      const ids = Array.from(new Set(rows.map((row) => row.profile_id)))

      let nameById: Record<string, string> = {}
      if (ids.length > 0) {
        const { data: profiles } = await admin
          .from('profiles')
          .select('id, full_name')
          .in('id', ids)
        nameById = Object.fromEntries(
          (profiles ?? []).map((profile) => [
            profile.id,
            profile.full_name ?? 'Sem nome',
          ])
        )
      }

      return {
        members: rows.map((row) => ({ profileId: row.profile_id, role: row.role })),
        nameById,
      }
    },
    ['casasync:house-members'],
    { tags: [dataTags.houseMembers(houseId)], revalidate: 300 }
  )(houseId)
)

export const getCachedChestStorageBytes = cache((houseId: string) =>
  unstable_cache(
    async (id: string): Promise<number> => {
      const admin = createAdminClient()
      try {
        return await houseAttachmentBytes(admin, id)
      } catch {
        return 0
      }
    },
    ['casasync:chest-storage-bytes'],
    { tags: [dataTags.chestStorage(houseId)], revalidate: 300 }
  )(houseId)
)

const scopeTag = {
  tasks: dataTags.tasks,
  rewards: dataTags.rewards,
  chest: dataTags.chest,
  houseSettings: dataTags.houseSettings,
  houseMembers: dataTags.houseMembers,
  storageChest: dataTags.chestStorage,
} as const

/** Escopo de cache da casa afetado por uma escrita. */
export type CacheScope = keyof typeof scopeTag

/**
 * Expira os escopos de cache da casa após uma escrita. Chamar **apenas de
 * dentro de Server Actions** — `updateTag` exige esse escopo (a action é o
 * "read-your-writes" do request). Antes de chamar, a escrita já aconteceu:
 * esta função não escreve no banco, só invalida.
 */
export function invalidateHouseCache(
  houseId: string,
  ...scopes: CacheScope[]
): void {
  for (const scope of scopes) {
    updateTag(scopeTag[scope](houseId))
  }
}

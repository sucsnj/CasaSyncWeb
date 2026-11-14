import { unstable_cache } from 'next/cache'
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
 * Dois níveis:
 * - `unstable_cache` (cross-request, tags por casa) — invalidado com
 *   `updateTag` nas Server Actions;
 * - `React.cache` por cima (dedupe dentro do request) — as telas chamam as
 *   mesmas leituras por vários caminhos (layout → página → action).
 *
 * Sem TTL: o dado só muda por escrita nossa, e toda escrita invalida a tag.
 * Exceção: `storage:chest:{houseId}` usa `revalidate: 300` como teto de
 * segurança, porque anexos são gravados pelas actions sem invalidar a contagem.
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
    { tags: [dataTags.tasks(houseId)] }
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
    { tags: [dataTags.rewards(houseId)] }
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
    { tags: [dataTags.chest(houseId)] }
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
      { tags: [dataTags.chest(houseId)] }
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
    { tags: [dataTags.houseMembers(houseId)] }
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

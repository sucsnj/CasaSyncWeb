'use server'

import { createAdminClient } from '@/utils/supabase/admin'
import {
  getActiveAdminHouse,
  getAdminHouses,
  getSessionProfile,
} from '@/utils/house'
import { getHouseActivePunishments } from '@/utils/active-punishment'
import { getHouseTimezoneSettings } from '@/utils/house-settings'
import type { HouseActivePunishment } from '@/utils/punishments'
import { DEFAULT_HOUSE_TIMEZONE } from '@/utils/timezone'
import type { Tables } from '@/types/database'

export type HouseMemberView = {
  profileId: string
  fullName: string
  username: string | null
  avatarUrl: string | null
  points: number
  role: 'ADMIN' | 'DEPENDENT'
  lastAccess: string | null
}

export type HousesBundle = {
  userId: string
  /** Casas controladas pelo ADMIN (próprias e co-geridas via PIN). */
  houses: Pick<
    Tables<'houses'>,
    'id' | 'name' | 'image_url' | 'code' | 'owner_id'
  >[]
  activeHouseId: string | null
  activeHouseName: string | null
  activeHouseImageUrl: string | null
  activeHouseOwnerId: string | null
  /** Fuso horário da casa ativa (para exibir último acesso no horário da casa). */
  timezone: string
  members: HouseMemberView[]
  activePunishments: HouseActivePunishment[]
}

/**
 * Visão do gerenciador de casas: identidade do ADMIN, lista de casas, casa
 * ativa + membros + /dependências do hub. Uma ida ao banco, escopados pela
 * sessão — mesmo padrão ADR-0006.
 */
export async function getHousesBundle(): Promise<HousesBundle> {
  const { user, profile } = await getSessionProfile()
  if (!user || !profile) throw new Error('UNAUTHENTICATED')
  if (profile.user_role !== 'ADMIN') throw new Error('FORBIDDEN')

  const admin = createAdminClient()
  const [activeHouse, houses] = await Promise.all([
    getActiveAdminHouse(),
    getAdminHouses(user.id),
  ])

  let members: HouseMemberView[] = []
  let activePunishments: HouseActivePunishment[] = []
  let timezone = DEFAULT_HOUSE_TIMEZONE

  if (activeHouse) {
    const { data: houseMembers, error: houseMembersError } = await admin
      .from('house_members')
      .select('profile_id, role')
      .eq('house_id', activeHouse.id)
    if (houseMembersError) throw new Error('READ_FAILED')

    const profileIds = houseMembers?.map((member) => member.profile_id) ?? []
    let infoById = new Map<
      string,
      {
        full_name: string | null
        username: string | null
        avatar_url: string | null
        points: number | null
      }
    >()
    let lastAccessById = new Map<string, string | null>()
    if (profileIds.length > 0) {
      const { data: profiles, error: profilesError } = await admin
        .from('profiles')
        .select('id, full_name, username, avatar_url, points')
        .in('id', profileIds)
      if (profilesError) throw new Error('READ_FAILED')
      infoById = new Map((profiles ?? []).map((p) => [p.id, p]))

      const { data: statsRows } = await admin
        .from('dependent_stats')
        .select('profile_id, updated_at')
        .in('profile_id', profileIds)
      const statsAccessById = new Map(
        (statsRows ?? []).map((row) => [row.profile_id, row.updated_at])
      )

      const accessResults = await Promise.all(
        profileIds.map(async (id) => {
          const statsAccess = statsAccessById.get(id) ?? null
          let authAccess: string | null = null
          try {
            const { data } = await admin.auth.admin.getUserById(id)
            authAccess = data.user?.last_sign_in_at ?? null
          } catch {
            authAccess = null
          }
          if (!statsAccess) return [id, authAccess] as const
          if (!authAccess) return [id, statsAccess] as const
          return [
            id,
            new Date(statsAccess).getTime() >= new Date(authAccess).getTime()
              ? statsAccess
              : authAccess,
          ] as const
        })
      )
      lastAccessById = new Map(accessResults)
    }

    members =
      houseMembers?.map((member) => {
        const info = infoById.get(member.profile_id)
        return {
          profileId: member.profile_id,
          fullName: info?.full_name ?? 'Sem nome',
          username: info?.username ?? null,
          avatarUrl: info?.avatar_url ?? null,
           points: info?.points ?? 0,
           role: member.role,
           lastAccess: lastAccessById.get(member.profile_id) ?? null,
         }
      }) ?? []

    activePunishments = await getHouseActivePunishments(activeHouse.id)
    const houseTimezone = await getHouseTimezoneSettings(activeHouse.id)
    timezone = houseTimezone.timezone
  }

  return {
    userId: user.id,
    houses: (houses ?? []).map((house) => ({
      id: house.id,
      name: house.name,
      image_url: house.image_url,
      code: house.code,
      owner_id: house.owner_id,
    })),
    activeHouseId: activeHouse?.id ?? null,
    activeHouseName: activeHouse?.name ?? null,
    activeHouseImageUrl: activeHouse?.image_url ?? null,
    activeHouseOwnerId: activeHouse?.owner_id ?? null,
    timezone,
    members,
    activePunishments,
  }
}

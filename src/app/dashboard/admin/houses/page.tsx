import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import {
  getActiveAdminHouse,
  getSessionProfile,
} from '@/utils/house'
import { HousesManager } from '@/components/houses/houses-manager'

export const metadata: Metadata = {
  title: 'Casas | CasaSync',
}

export const dynamic = 'force-dynamic'

export default async function AdminHousesPage() {
  const { user, profile } = await getSessionProfile()

  if (!user || profile?.user_role !== 'ADMIN') {
    redirect('/login')
  }

  const supabase = await createClient()
  const activeHouse = await getActiveAdminHouse()

  const { data: houses } = await supabase
    .from('houses')
    .select('id, name, image_url')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })

  let members: {
    profileId: string
    fullName: string
    username: string | null
    avatarUrl: string | null
    role: 'ADMIN' | 'DEPENDENT'
  }[] = []

  if (activeHouse) {
    const { data: houseMembers } = await supabase
      .from('house_members')
      .select('profile_id, role')
      .eq('house_id', activeHouse.id)

    const profileIds = houseMembers?.map((member) => member.profile_id) ?? []

    let infoById = new Map<string, { full_name: string | null; username: string | null; avatar_url: string | null }>()
    if (profileIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, username, avatar_url')
        .in('id', profileIds)

      infoById = new Map((profiles ?? []).map((p) => [p.id, p]))
    }

    members =
      houseMembers?.map((member) => {
        const info = infoById.get(member.profile_id)
        return {
          profileId: member.profile_id,
          fullName: info?.full_name ?? 'Sem nome',
          username: info?.username ?? null,
          avatarUrl: info?.avatar_url ?? null,
          role: member.role,
        }
      }) ?? []
  }

  return (
    <HousesManager
      houses={houses ?? []}
      activeHouseId={activeHouse?.id ?? null}
      activeHouseName={activeHouse?.name ?? null}
      activeHouseImageUrl={activeHouse?.image_url ?? null}
      members={members}
    />
  )
}
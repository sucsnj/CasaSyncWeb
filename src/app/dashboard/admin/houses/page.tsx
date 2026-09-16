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
    .select('id, name')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })

  let members: {
    profileId: string
    fullName: string
    role: 'ADMIN' | 'DEPENDENT'
  }[] = []

  if (activeHouse) {
    const { data: houseMembers } = await supabase
      .from('house_members')
      .select('profile_id, role')
      .eq('house_id', activeHouse.id)

    const profileIds = houseMembers?.map((member) => member.profile_id) ?? []

    let nameById = new Map<string, string>()
    if (profileIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', profileIds)

      nameById = new Map(
        (profiles ?? []).map((p) => [p.id, p.full_name ?? 'Sem nome'])
      )
    }

    members =
      houseMembers?.map((member) => ({
        profileId: member.profile_id,
        fullName: nameById.get(member.profile_id) ?? 'Sem nome',
        role: member.role,
      })) ?? []
  }

  return (
    <HousesManager
      houses={houses ?? []}
      activeHouseId={activeHouse?.id ?? null}
      activeHouseName={activeHouse?.name ?? null}
      members={members}
    />
  )
}
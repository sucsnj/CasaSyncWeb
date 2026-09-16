import { cookies } from 'next/headers'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import type { Database } from '@/types/database'

export type SessionProfile = {
  id: string
  full_name: string | null
  user_role: Database['public']['Enums']['user_role']
  points: number
  avatar_url: string | null
}

export type ActiveHouse = {
  id: string
  name: string
  image_url: string | null
}

export const ACTIVE_HOUSE_COOKIE = 'casasync_active_house'

/**
 * Retorna o usuário autenticado e seu perfil (via RLS, cliente autenticado).
 * `profile` é `null` se a linha em `profiles` ainda não existir.
 */
export async function getSessionProfile(): Promise<{
  user: { id: string } | null
  profile: SessionProfile | null
}> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { user: null, profile: null }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, user_role, points, avatar_url')
    .eq('id', user.id)
    .maybeSingle()

  return { user: { id: user.id }, profile: profile ?? null }
}

/**
 * Casa ativa do ADMIN: prioriza o cookie, senão cai para a primeira casa
 * criada por ele. Só o dono (`owner_id`) enxerga as casas via RLS.
 */
export async function getActiveAdminHouse(): Promise<ActiveHouse | null> {
  const { user } = await getSessionProfile()
  if (!user) return null

  const supabase = await createClient()

  const { data: houses } = await supabase
    .from('houses')
    .select('id, name, image_url')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })

  if (!houses || houses.length === 0) return null

  const cookieStore = await cookies()
  const cookieHouseId = cookieStore.get(ACTIVE_HOUSE_COOKIE)?.value

  return houses.find((house) => house.id === cookieHouseId) ?? houses[0]
}

/**
 * Casa do DEPENDENTE: primeira associação em `house_members`.
 * (Um dependente não escolhe casa; ela é definida pelo ADMIN na criação.)
 */
export async function getDependentHouse(userId: string): Promise<ActiveHouse | null> {
  const supabase = await createClient()

  const { data: membership } = await supabase
    .from('house_members')
    .select('house_id, houses ( id, name, image_url )')
    .eq('profile_id', userId)
    .limit(1)
    .maybeSingle()

  if (!membership?.houses) return null

  return membership.houses
}

/**
 * Lista os dependentes de uma casa: id + full_name (para vincular tarefas).
 */
export async function getHouseAssignees(houseId: string): Promise<
  { id: string; full_name: string }[]
> {
  const supabase = await createClient()

  const { data: members } = await supabase
    .from('house_members')
    .select('profile_id')
    .eq('house_id', houseId)
    .eq('role', 'DEPENDENT')

  const profileIds = members?.map((member) => member.profile_id) ?? []
  if (profileIds.length === 0) return []

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', profileIds)

  return (
    profiles?.map((p) => ({
      id: p.id,
      full_name: p.full_name ?? 'Sem nome',
    })) ?? []
  )
}

export type Tutor = {
  id: string
  full_name: string | null
  avatar_url: string | null
}

/**
 * Perfil do ADMIN que criou a casa (tutor). Busca via service role porque o
 * dependente não tem RLS de select em `profiles` de terceiros.
 */
export async function getHouseTutor(houseId: string): Promise<Tutor | null> {
  const admin = createAdminClient()

  const { data: house } = await admin
    .from('houses')
    .select('owner_id')
    .eq('id', houseId)
    .maybeSingle()

  if (!house) return null

  const { data: profile } = await admin
    .from('profiles')
    .select('id, full_name, avatar_url')
    .eq('id', house.owner_id)
    .maybeSingle()

  return profile ?? null
}

/**
 * Executa uma mutation com o cliente service-role a partir de um callback.
 * O pattern do projeto: autorização SEMPRE deriva da sessão (cliente
 * autenticado + RLS); o cliente admin é usado apenas para as escritas e
 * para operações que o RLS do usuário comum não cobre (ex: crédito de pontos).
 */
export async function withAdminClient<T>(
  callback: (admin: ReturnType<typeof createAdminClient>) => Promise<T>
): Promise<T> {
  return callback(createAdminClient())
}
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
 * Casas que o ADMIN controla: as que criou (owner) E as que entrou via PIN
 * (membro `house_members.role = 'ADMIN'`).
 *
 * Lida com o cliente service-role (mesmo precedente de `getHouseTutors`) para
 * a listagem das casas não depender de policies RLS específicas para
 * co-gerentes — o que importa é o controle medido pela membresia. O `userId`
 * sempre vem da sessão autenticada, nunca de input público.
 */
export async function getAdminHouses(userId: string): Promise<
  { id: string; name: string; image_url: string | null; code: string }[]
> {
  const admin = createAdminClient()

  const { data: memberships } = await admin
    .from('house_members')
    .select('house_id, houses ( id, name, image_url, code )')
    .eq('profile_id', userId)
    .eq('role', 'ADMIN')
    .order('created_at', { ascending: true })

  const rows = (memberships ?? []).flatMap((member) => member.houses ?? [])
  return Array.from(new Map(rows.map((house) => [house.id, house])).values())
}

/**
 * Casa ativa do ADMIN: prioriza o cookie, senão cai para a primeira casa
 * controlada por ele (criada ou co-gerida via PIN).
 */
export async function getActiveAdminHouse(): Promise<ActiveHouse | null> {
  const { user } = await getSessionProfile()
  if (!user) return null

  const houses = await getAdminHouses(user.id)
  if (houses.length === 0) return null

  const cookieStore = await cookies()
  const cookieHouseId = cookieStore.get(ACTIVE_HOUSE_COOKIE)?.value

  const active = houses.find((house) => house.id === cookieHouseId) ?? houses[0]

  return { id: active.id, name: active.name, image_url: active.image_url }
}

/**
 * Casa do DEPENDENTE: primeira associação em `house_members`.
 * (Um dependente não escolhe casa; ela é definida pelo ADMIN na criação.)
 *
 * Service-role pelo mesmo motivo de `getAdminHouses`: a associação medida é a
 * do próprio usuário da sessão, sem depender de policies RLS.
 */
export async function getDependentHouse(userId: string): Promise<ActiveHouse | null> {
  const admin = createAdminClient()

  const { data: membership } = await admin
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
 * Acessa via service role: o ADMIN só precisa CONTROLAR a casa (criada ou
 * co-gerida via PIN) para listar os dependentes, sem depender de policies RLS.
 */
export async function getHouseAssignees(houseId: string): Promise<
  { id: string; full_name: string }[]
> {
  const admin = createAdminClient()

  const { data: members } = await admin
    .from('house_members')
    .select('profile_id')
    .eq('house_id', houseId)
    .eq('role', 'DEPENDENT')

  const profileIds = members?.map((member) => member.profile_id) ?? []
  if (profileIds.length === 0) return []

  const { data: profiles } = await admin
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
 * Tutores da casa: todos os ADMIN membros (`house_members.role='ADMIN'`) — o
 * dono e os co-gerentes que entraram via PIN. Busca via service role porque o
 * dependente não tem RLS de select em `profiles` de terceiros.
 */
export async function getHouseTutors(houseId: string): Promise<Tutor[]> {
  const admin = createAdminClient()

  const { data: members } = await admin
    .from('house_members')
    .select('profile_id')
    .eq('house_id', houseId)
    .eq('role', 'ADMIN')

  const profileIds = members?.map((member) => member.profile_id) ?? []
  if (profileIds.length === 0) return []

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, full_name, avatar_url')
    .in('id', profileIds)

  return profiles ?? []
}

/**
 * Mapa `profile_id → full_name` (para exibir o criador de tarefas/recompensas).
 * Service role: o dependente não enxerga `profiles` de terceiros via RLS.
 */
export async function getProfileNames(
  ids: string[]
): Promise<Record<string, string>> {
  const unique = Array.from(new Set(ids.filter(Boolean)))
  if (unique.length === 0) return {}

  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('id, full_name')
    .in('id', unique)

  return Object.fromEntries(
    (data ?? []).map((profile) => [
      profile.id,
      profile.full_name ?? 'Administrador',
    ])
  )
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
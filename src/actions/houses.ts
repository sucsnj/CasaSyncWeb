'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import {
  ACTIVE_HOUSE_COOKIE,
  getSessionProfile,
} from '@/utils/house'
import type { ActionResult } from './types'
import {
  validatePassword,
  validatePoints,
  validateUsername,
} from './types'

const DEPENDENT_EMAIL_DOMAIN = 'dependente.casasync'

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateJoinCode(): string {
  let code = ''
  for (let i = 0; i < 6; i += 1) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  }
  return code
}

async function generateUniqueCode(
  admin: ReturnType<typeof createAdminClient>
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateJoinCode()
    const { data: existing } = await admin
      .from('houses')
      .select('id')
      .eq('code', code)
      .maybeSingle()

    if (!existing) return code
  }
  throw new Error('Não foi possível gerar um código de casa único.')
}

export async function createHouse(name: string): Promise<ActionResult> {
  const { user, profile } = await getSessionProfile()

  if (!user || profile?.user_role !== 'ADMIN') {
    return { ok: false, error: 'Apenas administradores podem criar casas.' }
  }

  const houseName = name.trim()
  if (!houseName) {
    return { ok: false, error: 'Informe um nome para a casa.' }
  }

  const admin = createAdminClient()

  let code: string
  try {
    code = await generateUniqueCode(admin)
  } catch {
    return { ok: false, error: 'Falha ao gerar o código da casa.' }
  }

  const { data: house, error: houseError } = await admin
    .from('houses')
    .insert({
      name: houseName,
      code,
      owner_id: user.id,
    })
    .select('id')
    .single()

  if (houseError || !house) {
    return { ok: false, error: 'Falha ao criar a casa.' }
  }

  const { error: membershipError } = await admin.from('house_members').insert({
    house_id: house.id,
    profile_id: user.id,
    role: 'ADMIN',
  })

  if (membershipError) {
    await admin.from('houses').delete().eq('id', house.id)
    return { ok: false, error: 'Falha ao vincular à nova casa.' }
  }

  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_HOUSE_COOKIE, house.id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  })

  revalidatePath('/dashboard/admin')
  revalidatePath('/dashboard/admin/houses')
  revalidatePath('/tasks')
  revalidatePath('/rewards')

  return { ok: true, message: `Casa "${houseName}" criada.` }
}

export async function selectHouse(houseId: string): Promise<ActionResult> {
  const { user, profile } = await getSessionProfile()

  if (!user || profile?.user_role !== 'ADMIN') {
    return { ok: false, error: 'Apenas administradores podem trocar de casa.' }
  }

  const admin = createAdminClient()

  // Controla a casa como ADMIN (criador ou co-gerente via PIN).
  const { data: membership } = await admin
    .from('house_members')
    .select('id')
    .eq('house_id', houseId)
    .eq('profile_id', user.id)
    .eq('role', 'ADMIN')
    .maybeSingle()

  if (!membership) {
    return { ok: false, error: 'Casa não encontrada ou sem permissão.' }
  }

  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_HOUSE_COOKIE, houseId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  })

  revalidatePath('/dashboard/admin')
  revalidatePath('/dashboard/admin/houses')
  revalidatePath('/tasks')
  revalidatePath('/rewards')

  return { ok: true }
}

/**
 * ADMIN entra como co-gerente de uma casa usando o PIN único (houses.code).
 * Valida o PIN, cria a membresia ADMIN (se ainda não for membro) e define
 * a casa como ativa. O criador da casa continua dono (`owner_id`) — o PIN
 * apenas concede controle simultâneo.
 */
export async function joinHouseByPin(pin: string): Promise<ActionResult> {
  const { user, profile } = await getSessionProfile()

  if (!user || profile?.user_role !== 'ADMIN') {
    return { ok: false, error: 'Apenas administradores podem controlar casas.' }
  }

  const normalizedPin = pin.trim().toUpperCase()
  if (!normalizedPin) {
    return { ok: false, error: 'Informe o PIN da casa.' }
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return { ok: false, error: 'Configuração do servidor indisponível.' }
  }

  const { data: house } = await admin
    .from('houses')
    .select('id, name')
    .eq('code', normalizedPin)
    .maybeSingle()

  if (!house) {
    return { ok: false, error: 'PIN inválido.' }
  }

  const { data: existing } = await admin
    .from('house_members')
    .select('role')
    .eq('house_id', house.id)
    .eq('profile_id', user.id)
    .maybeSingle()

  if (existing && existing.role === 'DEPENDENT') {
    return {
      ok: false,
      error: 'Você pertence a esta casa como dependente, não como admin.',
    }
  }

  if (!existing) {
    const { error: membershipError } = await admin
      .from('house_members')
      .insert({ house_id: house.id, profile_id: user.id, role: 'ADMIN' })

    if (membershipError) {
      return { ok: false, error: 'Falha ao vincular à casa.' }
    }
  }

  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_HOUSE_COOKIE, house.id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  })

  revalidatePath('/dashboard/admin')
  revalidatePath('/dashboard/admin/houses')
  revalidatePath('/tasks')
  revalidatePath('/rewards')

  return { ok: true, message: `Você agora controla a casa "${house.name}".` }
}

export async function createDependent(
  fullName: string,
  username: string,
  password: string,
  houseId?: string
): Promise<ActionResult> {
  const name = fullName.trim()
  const normalizedUsername = username.trim().toLowerCase()

  if (!name) {
    return { ok: false, error: 'Informe o nome do dependente.' }
  }

  const usernameError = validateUsername(normalizedUsername)
  if (usernameError) {
    return { ok: false, error: usernameError }
  }

  const passwordError = validatePassword(password)
  if (passwordError) {
    return { ok: false, error: passwordError }
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { ok: false, error: 'Você precisa estar autenticado.' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('user_role')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.user_role !== 'ADMIN') {
    return { ok: false, error: 'Apenas administradores podem criar dependentes.' }
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return { ok: false, error: 'Configuração do servidor indisponível.' }
  }

  const { data: existing } = await admin
    .from('profiles')
    .select('id')
    .eq('username', normalizedUsername)
    .maybeSingle()

  if (existing) {
    return { ok: false, error: 'Este nome de usuário já está em uso.' }
  }

  let targetHouseId: string

  if (houseId) {
    // ENSINO (teach): validar o controle da casa no servidor (via service
    // role) impede que um ADMIN crie dependentes em casas que não controla
    // (dono ou co-gerente via PIN), mesmo que o formulário/cliente seja adulterado.
    const { data: membership } = await admin
      .from('house_members')
      .select('id')
      .eq('house_id', houseId)
      .eq('profile_id', user.id)
      .eq('role', 'ADMIN')
      .maybeSingle()

    if (!membership) {
      return {
        ok: false,
        error: 'Você não pode adicionar dependentes a essa casa.',
      }
    }

    targetHouseId = houseId
  } else {
    const { data: membership } = await supabase
      .from('house_members')
      .select('house_id')
      .eq('profile_id', user.id)
      .maybeSingle()

    if (!membership) {
      return { ok: false, error: 'Você ainda não está vinculado a uma casa.' }
    }

    targetHouseId = membership.house_id
  }

  const email = `${normalizedUsername}@${DEPENDENT_EMAIL_DOMAIN}`

  const { data: createdUser, error: createError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: name,
        username: normalizedUsername,
        user_role: 'DEPENDENT',
      },
    })

  if (createError || !createdUser?.user) {
    return { ok: false, error: createError?.message ?? 'Falha ao criar a conta.' }
  }

  const dependentUserId = createdUser.user.id

  const { error: profileError } = await admin.from('profiles').upsert(
    {
      id: dependentUserId,
      full_name: name,
      username: normalizedUsername,
      user_role: 'DEPENDENT',
    },
    { onConflict: 'id' }
  )

  if (profileError) {
    await admin.auth.admin.deleteUser(dependentUserId)
    return { ok: false, error: 'Falha ao criar o perfil do dependente.' }
  }

  const { error: membershipError } = await admin
    .from('house_members')
    .insert({
      house_id: targetHouseId,
      profile_id: dependentUserId,
      role: 'DEPENDENT',
    })

  if (membershipError) {
    await admin.auth.admin.deleteUser(dependentUserId)
    return { ok: false, error: 'Falha ao vincular o dependente à casa.' }
  }

  revalidatePath('/dashboard/admin')
  revalidatePath('/dashboard/admin/houses')
  revalidatePath('/tasks')
  revalidatePath('/rewards')

  return {
    ok: true,
    message: `Dependente ${name} criado e vinculado à casa.`,
  }
}

/** ADMIN edita (nome/foto) uma casa que lhe pertence — sem excluir. */
export async function updateHouse(
  houseId: string,
  patch: { name?: string; imageUrl?: string | null }
): Promise<ActionResult> {
  const { user, profile } = await getSessionProfile()

  if (!user || profile?.user_role !== 'ADMIN') {
    return { ok: false, error: 'Apenas administradores podem editar casas.' }
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return { ok: false, error: 'Configuração do servidor indisponível.' }
  }

  const { data: house } = await admin
    .from('houses')
    .select('id')
    .eq('id', houseId)
    .maybeSingle()

  if (!house) {
    return { ok: false, error: 'Casa não encontrada.' }
  }

  // Controla a casa como ADMIN (criador ou co-gerente via PIN).
  const { data: membership } = await admin
    .from('house_members')
    .select('id')
    .eq('house_id', houseId)
    .eq('profile_id', user.id)
    .eq('role', 'ADMIN')
    .maybeSingle()

  if (!membership) {
    return { ok: false, error: 'Casa não encontrada ou sem permissão.' }
  }

  const updates: { name?: string; image_url?: string | null } = {}
  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (!name) return { ok: false, error: 'Informe um nome para a casa.' }
    updates.name = name
  }
  if (patch.imageUrl !== undefined) {
    updates.image_url = patch.imageUrl?.trim() ? patch.imageUrl.trim() : null
  }
  if (Object.keys(updates).length === 0) return { ok: true }

  const { error } = await admin.from('houses').update(updates).eq('id', houseId)
  if (error) return { ok: false, error: 'Falha ao atualizar a casa.' }

  revalidatePath('/dashboard/admin')
  revalidatePath('/dashboard/admin/houses')
  revalidatePath('/tasks')
  revalidatePath('/rewards')

  return { ok: true, message: 'Casa atualizada.' }
}

/** ADMIN edita nome/username/avatar de um dependente de uma casa sua. */
export async function updateDependentProfile(
  dependentId: string,
  patch: {
    fullName?: string
    username?: string
    avatarUrl?: string | null
  }
): Promise<ActionResult> {
  const { user, profile } = await getSessionProfile()

  if (!user || profile?.user_role !== 'ADMIN') {
    return { ok: false, error: 'Apenas administradores podem editar dependentes.' }
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return { ok: false, error: 'Configuração do servidor indisponível.' }
  }

  const { data: member } = await admin
    .from('house_members')
    .select('house_id')
    .eq('profile_id', dependentId)
    .eq('role', 'DEPENDENT')
    .maybeSingle()

  if (!member) {
    return { ok: false, error: 'Dependente não encontrado.' }
  }

  const { data: isAdmin } = await admin
    .from('house_members')
    .select('id')
    .eq('house_id', member.house_id)
    .eq('profile_id', user.id)
    .eq('role', 'ADMIN')
    .maybeSingle()

  if (!isAdmin) {
    return { ok: false, error: 'Dependente não pertence a uma casa sua.' }
  }

  const updates: {
    full_name?: string
    username?: string
    avatar_url?: string | null
  } = {}

  if (patch.fullName !== undefined) {
    const name = patch.fullName.trim()
    if (!name) return { ok: false, error: 'Informe o nome do dependente.' }
    updates.full_name = name
  }
  if (patch.username !== undefined) {
    const normalized = patch.username.trim().toLowerCase()
    const usernameError = validateUsername(normalized)
    if (usernameError) return { ok: false, error: usernameError }

    const { data: existing } = await admin
      .from('profiles')
      .select('id')
      .eq('username', normalized)
      .neq('id', dependentId)
      .maybeSingle()

    if (existing) {
      return { ok: false, error: 'Este nome de usuário já está em uso.' }
    }
    updates.username = normalized
  }
  if (patch.avatarUrl !== undefined) {
    updates.avatar_url = patch.avatarUrl?.trim() ? patch.avatarUrl.trim() : null
  }
  if (Object.keys(updates).length === 0) return { ok: true }

  const { error } = await admin
    .from('profiles')
    .update(updates)
    .eq('id', dependentId)
  if (error) return { ok: false, error: 'Falha ao atualizar o dependente.' }

  revalidatePath('/dashboard/admin')
  revalidatePath('/dashboard/admin/houses')
  revalidatePath('/tasks')
  revalidatePath('/rewards')

  return { ok: true, message: 'Dependente atualizado.' }
}

/**
 * ADMIN redefine a senha/PIN de um membro (dependente ou co-ADMIN) de uma casa
 * que controla, via service role — sem e-mail de recuperação.
 *
 * Autorização SEMPRE derivada da sessão: o ator precisa ser ADMIN membro de ao
 * menos uma casa, e o alvo precisa ser membro de uma dessas casas. Nunca se
 * confia no `targetUserId` vindo do cliente sem essa checagem (evita redefinir
 * a senha de usuários de outras casas). A nova senha nunca é logada.
 */
export async function updateMemberPassword(
  targetUserId: string,
  newPassword: string
): Promise<ActionResult> {
  const { user, profile } = await getSessionProfile()

  if (!user || profile?.user_role !== 'ADMIN') {
    return { ok: false, error: 'Apenas administradores podem redefinir senhas.' }
  }

  const passwordError = validatePassword(newPassword)
  if (passwordError) {
    return { ok: false, error: passwordError }
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return { ok: false, error: 'Configuração do servidor indisponível.' }
  }

  // Casas que o ator controla (dono ou co-gerente via PIN).
  const { data: actorHouses } = await admin
    .from('house_members')
    .select('house_id')
    .eq('profile_id', user.id)
    .eq('role', 'ADMIN')

  const houseIds = actorHouses?.map((member) => member.house_id) ?? []
  if (houseIds.length === 0) {
    return { ok: false, error: 'Você não controla nenhuma casa.' }
  }

  // O alvo precisa ser membro de uma dessas casas (dependente ou co-ADMIN).
  const { data: targetMembership } = await admin
    .from('house_members')
    .select('id')
    .eq('profile_id', targetUserId)
    .in('house_id', houseIds)
    .limit(1)
    .maybeSingle()

  if (!targetMembership) {
    return {
      ok: false,
      error: 'Membro não pertence a uma casa que você controla.',
    }
  }

  try {
    const { error } = await admin.auth.admin.updateUserById(targetUserId, {
      password: newPassword,
    })
    if (error) {
      return { ok: false, error: 'Falha ao redefinir a senha.' }
    }
  } catch {
    return { ok: false, error: 'Falha ao redefinir a senha.' }
  }

  return {
    ok: true,
    message: 'Senha atualizada. O membro já pode entrar com a nova senha.',
  }
}

/**
 * ADMIN altera o saldo de pontos acumulados de um dependente, protegido pelo
 * PIN_PTS (env server-only, mesma mecânica do MASTER_PIN). O valor é um SET
 * absoluto do acumulado (pode ser negativo). Autorização derivada da sessão:
 * o alvo precisa ser membro DEPENDENT de uma casa que o ator controla como
 * ADMIN; a escrita de `profiles.points` usa service role.
 */
export async function updateDependentPoints(
  dependentId: string,
  newPoints: number,
  pinPts: string
): Promise<ActionResult> {
  const { user, profile } = await getSessionProfile()

  if (!user || profile?.user_role !== 'ADMIN') {
    return { ok: false, error: 'Apenas administradores podem alterar pontos.' }
  }

  const pointsError = validatePoints(newPoints)
  if (pointsError) {
    return { ok: false, error: pointsError }
  }

  if (pinPts !== process.env.PIN_PTS) {
    return { ok: false, error: 'PIN de pontos inválido.' }
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return { ok: false, error: 'Configuração do servidor indisponível.' }
  }

  // O alvo precisa ser um DEPENDENT de alguma casa que o ator controla.
  const { data: member } = await admin
    .from('house_members')
    .select('house_id')
    .eq('profile_id', dependentId)
    .eq('role', 'DEPENDENT')
    .limit(1)
    .maybeSingle()

  if (!member) {
    return { ok: false, error: 'Dependente não encontrado.' }
  }

  const { data: isAdmin } = await admin
    .from('house_members')
    .select('id')
    .eq('house_id', member.house_id)
    .eq('profile_id', user.id)
    .eq('role', 'ADMIN')
    .maybeSingle()

  if (!isAdmin) {
    return { ok: false, error: 'Dependente não pertence a uma casa sua.' }
  }

  const { error } = await admin
    .from('profiles')
    .update({ points: newPoints })
    .eq('id', dependentId)

  if (error) {
    return { ok: false, error: 'Falha ao atualizar os pontos.' }
  }

  revalidatePath('/dashboard/admin')
  revalidatePath('/dashboard/admin/houses')
  revalidatePath('/dashboard/dependent')
  revalidatePath('/tasks')
  revalidatePath('/rewards')

  return { ok: true, message: `Pontos atualizados para ${newPoints}.` }
}
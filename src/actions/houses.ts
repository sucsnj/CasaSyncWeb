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
import { notifyUser } from '@/utils/notifications'
import { getPushTable } from '@/lib/push-service'

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

/**
 * Carrega a casa quando o ator é o AUTOR (criador) dela (`houses.owner_id`).
 * Diferente do controle por membresia ADMIN (dono ou co-gerente via PIN), o
 * autor tem poderes exclusivos: expulsar membros, trocar o PIN e excluir a
 * casa (se vazia). Retorna `null` quando não é o autor.
 */
async function getOwnedHouse(
  admin: ReturnType<typeof createAdminClient>,
  houseId: string,
  userId: string
): Promise<{ id: string; name: string } | null> {
  const { data: house } = await admin
    .from('houses')
    .select('id, name, owner_id')
    .eq('id', houseId)
    .maybeSingle()

  if (!house || house.owner_id !== userId) return null
  return { id: house.id, name: house.name }
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
    .select('house_id')
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

  // Autor = criador da casa (`owner_id`). Só o autor altera a senha de OUTROS
  // membros; um co-ADMIN (que entrou via PIN) altera apenas a própria senha.
  if (targetUserId !== user.id) {
    const { data: ownedHouse } = await admin
      .from('houses')
      .select('id')
      .eq('id', targetMembership.house_id)
      .eq('owner_id', user.id)
      .maybeSingle()

    if (!ownedHouse) {
      return {
        ok: false,
        error: 'Apenas o autor da casa pode alterar a senha de outros membros.',
      }
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
 * PIN da casa (`houses.code`) — o mesmo PIN de convite exibido em "Suas casas"
 * (case-insensitive). O valor é um SET absoluto do acumulado (pode ser
 * negativo). Autorização derivada da sessão: o alvo precisa ser membro
 * DEPENDENT de uma casa que o ator controla como ADMIN; a escrita de
 * `profiles.points` usa service role.
 * 
 * ADMIN penaliza um dependente subtraindo uma quantia fixa de seus pontos
 * acumulados. Protegido pelo PIN da casa e lógica de membresia (o dependente
 * precisa pertencer a uma casa controlada pelo admin). Implementado como SET
 * negativo no banco (não é cumulativo).
 */
export async function updateDependentPoints(
  dependentId: string,
  newPoints: number,
  pinPts: string,
  reason?: string
): Promise<ActionResult> {
  const { user, profile } = await getSessionProfile()

  if (!user || profile?.user_role !== 'ADMIN') {
    return { ok: false, error: 'Apenas administradores podem alterar pontos.' }
  }

  const pointsError = validatePoints(newPoints)
  if (pointsError) {
    return { ok: false, error: pointsError }
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
    .select('house_id, profiles!inner(points)')
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

  // O PIN que autoriza a alteração é o próprio PIN da casa (`houses.code`) —
  // comparado como `joinHouseByPin` (trim + uppercase, tolerante a espaços).
  const { data: house } = await admin
    .from('houses')
    .select('code')
    .eq('id', member.house_id)
    .maybeSingle()

  const normalizedPin = pinPts.trim().toUpperCase()
  if (!house || normalizedPin !== house.code) {
    return { ok: false, error: 'PIN de pontos inválido.' }
  }

  // Traz os pontos atuais do dependente
  const currentPoints = member.profiles?.points ?? 0

  // Reajuste para valor MENOR que o atual é penalização: exige motivo ANTES de gravar.
  // Valores iguais ou maiores podem ignorar o motivo (não há débito).
  const pointsDeducted = currentPoints - newPoints
  const trimmedReason = reason?.trim()
  if (pointsDeducted > 0 && !trimmedReason) {
    return { ok: false, error: 'Informe o motivo da penalização.' }
  }

  const { error } = await admin
    .from('profiles')
    .update({ points: newPoints })
    .eq('id', dependentId)

  if (error) {
    return { ok: false, error: 'Falha ao atualizar os pontos.' }
  }

  // Se houve DÉBITO de pontos (penalização), envia notificação
  if (pointsDeducted > 0) {
    await notifyUser(admin, {
      houseId: member.house_id,
      recipientId: dependentId,
      actorId: user.id,
      type: 'PENALTY',
      title: 'Penalidade Aplicada',
      body: `-${pointsDeducted} pt(s) · Motivo: ${trimmedReason}`,
      link: '/dashboard/dependent',
    })
  }

  revalidatePath('/dashboard/admin')
  revalidatePath('/dashboard/admin/houses')
  revalidatePath('/dashboard/dependent')
  revalidatePath('/tasks')
  revalidatePath('/rewards')

  return { ok: true, message: `Pontos atualizados para ${newPoints}.` }
}

/**
 * SÓ o AUTOR (criador) da casa expulsa um membro (co-ADMIN ou dependente).
 * Autorização derivada da sessão: `houses.owner_id === user.id`. Apaga os
 * dados ATIVOS do expulso na casa — tarefas pendentes/ativas, resgates
 * pendentes e sugestões — e mantém o histórico (tarefas concluídas/aprovadas
 * e resgates resolvidos). Pontos do perfil (globais) são preservados.
 */
export async function expelMember(
  houseId: string,
  targetUserId: string
): Promise<ActionResult> {
  const { user, profile } = await getSessionProfile()

  if (!user || profile?.user_role !== 'ADMIN') {
    return { ok: false, error: 'Apenas administradores podem expulsar membros.' }
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return { ok: false, error: 'Configuração do servidor indisponível.' }
  }

  const house = await getOwnedHouse(admin, houseId, user.id)
  if (!house) {
    return { ok: false, error: 'Casa não encontrada ou você não é o autor dela.' }
  }

  if (targetUserId === user.id) {
    return { ok: false, error: 'Você não pode se expulsar da própria casa.' }
  }

  const { data: membership } = await admin
    .from('house_members')
    .select('role')
    .eq('house_id', houseId)
    .eq('profile_id', targetUserId)
    .maybeSingle()

  if (!membership) {
    return { ok: false, error: 'Membro não encontrado na casa.' }
  }

  const { error: tasksError } = await admin
    .from('tasks')
    .delete()
    .eq('house_id', houseId)
    .eq('assigned_to', targetUserId)
    .in('status', ['PENDING', 'IN_PROGRESS', 'NOT_DELIVERED'])
  if (tasksError) {
    return { ok: false, error: 'Falha ao remover as tarefas ativas do membro.' }
  }

  const { error: redemptionsError } = await admin
    .from('reward_redemptions')
    .delete()
    .eq('house_id', houseId)
    .eq('profile_id', targetUserId)
    .eq('status', 'PENDING')
  if (redemptionsError) {
    return { ok: false, error: 'Falha ao remover os resgates pendentes.' }
  }

  const { error: suggestionsError } = await admin
    .from('reward_suggestions')
    .delete()
    .eq('house_id', houseId)
    .eq('profile_id', targetUserId)
  if (suggestionsError) {
    return { ok: false, error: 'Falha ao remover as sugestões do membro.' }
  }

  // Progresso de conquistas do expulso nesta casa é removido com a membresia.
  const { error: achievementsError } = await admin
    .from('dependent_achievements')
    .delete()
    .eq('house_id', houseId)
    .eq('profile_id', targetUserId)
  if (achievementsError) {
    return { ok: false, error: 'Falha ao remover o progresso de conquistas.' }
  }

  // Estatísticas do dependente (contadores de conquistas) morrem com o vínculo.
  const { error: statsError } = await admin
    .from('dependent_stats')
    .delete()
    .eq('house_id', houseId)
    .eq('profile_id', targetUserId)
  if (statsError) {
    return { ok: false, error: 'Falha ao remover as estatísticas do membro.' }
  }

  const { error: membershipError } = await admin
    .from('house_members')
    .delete()
    .eq('house_id', houseId)
    .eq('profile_id', targetUserId)
  if (membershipError) {
    return { ok: false, error: 'Falha ao remover o vínculo do membro.' }
  }

  revalidatePath('/dashboard/admin')
  revalidatePath('/dashboard/admin/houses')
  revalidatePath('/dashboard/dependent')
  revalidatePath('/tasks')
  revalidatePath('/rewards')

  const roleLabel = membership.role === 'ADMIN' ? 'Administrador' : 'Dependente'
  return {
    ok: true,
    message: `${roleLabel} removido da casa "${house.name}".`,
  }
}

/**
 * Limpeza best-effort das imagens do dependente no bucket público
 * `casasync-media`: avatar (`avatars/<id>/`) e as imagens das mensagens
 * rápidas enviadas por ele (`messages/<id>/`). Falha aqui nunca derruba a
 * exclusão da conta — sobra só arquivo órfão no storage (sem cascade natural).
 */
async function deleteMemberStorage(
  admin: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<void> {
  const bucket = 'casasync-media'
  try {
    for (const folder of ['avatars', 'messages']) {
      const sub = `${folder}/${userId}`
      const { data, error } = await admin.storage.from(bucket).list(sub)
      if (error || !data?.length) continue
      const paths = data
        .filter((file) => file.name)
        .map((file) => `${sub}/${file.name}`)
      await admin.storage.from(bucket).remove(paths)
    }
  } catch (err) {
    console.error('[STORAGE] Falha ao limpar arquivos do dependente:', err)
  }
}

/**
 * SÓ o AUTOR exclui a conta completa de um DEPENDENT da casa: login (auth),
 * perfil, pontos e assinaturas de push são removidos; tarefas ativas, resgates,
 * sugestões e notificações do dependente são apagados. O HISTÓRICO da casa é
 * preservado: tarefas concluídas/aprovadas são MANTIDAS e apenas desatribuídas
 * (`assigned_to`/`completed_by` → null — colunas nuláveis). Resgates resolvidos
 * e sugestões são removidos com a pessoa (o contrato de `reward_redemptions.
 * profile_id` é NOT NULL — não há como reter o log sem migração); a recompensa
 * em si permanece, e notificações cujo `actor_id` era o dependente ficam com
 * ator nulo (`set null`).
 */
export async function deleteDependentAccount(
  houseId: string,
  targetUserId: string
): Promise<ActionResult> {
  const { user, profile } = await getSessionProfile()

  if (!user || profile?.user_role !== 'ADMIN') {
    return { ok: false, error: 'Apenas administradores podem excluir contas.' }
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return { ok: false, error: 'Configuração do servidor indisponível.' }
  }

  const house = await getOwnedHouse(admin, houseId, user.id)
  if (!house) {
    return { ok: false, error: 'Casa não encontrada ou você não é o autor dela.' }
  }

  if (targetUserId === user.id) {
    return { ok: false, error: 'Você não pode excluir a própria conta.' }
  }

  const { data: membership } = await admin
    .from('house_members')
    .select('role')
    .eq('house_id', houseId)
    .eq('profile_id', targetUserId)
    .maybeSingle()

  if (!membership) {
    return { ok: false, error: 'Membro não encontrado na casa.' }
  }

  if (membership.role !== 'DEPENDENT') {
    return { ok: false, error: 'Conta de administrador não pode ser excluída.' }
  }

  const { data: targetProfile } = await admin
    .from('profiles')
    .select('full_name')
    .eq('id', targetUserId)
    .maybeSingle()

  const targetName = targetProfile?.full_name?.trim() || 'dependente'

  // Tarefas ativas do dependente são apagadas (sem valor para a casa).
  const { error: tasksActiveError } = await admin
    .from('tasks')
    .delete()
    .eq('house_id', houseId)
    .eq('assigned_to', targetUserId)
    .in('status', ['PENDING', 'IN_PROGRESS', 'NOT_DELIVERED'])
  if (tasksActiveError) {
    return { ok: false, error: 'Falha ao remover as tarefas ativas do dependente.' }
  }

  // Tarefas concluídas/aprovadas da casa são MANTIDAS como histórico — só
  // desatribuímos o dependente (colunas nuláveis), na própria atribuição ou
  // como quem concluiu.
  const { error: tasksHistoryError } = await admin
    .from('tasks')
    .update({ assigned_to: null, completed_by: null })
    .eq('house_id', houseId)
    .or(`assigned_to.eq.${targetUserId},completed_by.eq.${targetUserId}`)
    .in('status', ['COMPLETED', 'APPROVED'])
  if (tasksHistoryError) {
    return { ok: false, error: 'Falha ao desatribuir o histórico de tarefas.' }
  }

  // Resgates do dependente (pendentes e resolvidos) são removidos — a coluna
  // `profile_id` é NOT NULL e o histórico de resgate pertence à pessoa.
  const { error: redemptionsError } = await admin
    .from('reward_redemptions')
    .delete()
    .eq('house_id', houseId)
    .eq('profile_id', targetUserId)
  if (redemptionsError) {
    return { ok: false, error: 'Falha ao remover os resgates do dependente.' }
  }

  // Sugestões do dependente são removidas (propostas, sem valor histórico).
  const { error: suggestionsError } = await admin
    .from('reward_suggestions')
    .delete()
    .eq('house_id', houseId)
    .eq('profile_id', targetUserId)
  if (suggestionsError) {
    return { ok: false, error: 'Falha ao remover as sugestões do dependente.' }
  }

  // Notificações do dependente (cascade `recipient_id`, mas explícito).
  const { error: notificationsError } = await admin
    .from('notifications')
    .delete()
    .eq('recipient_id', targetUserId)
  if (notificationsError) {
    return { ok: false, error: 'Falha ao remover as notificações do dependente.' }
  }

  // Assinaturas de push (cascade `user_id`, mas explícito).
  const { error: pushError } = await getPushTable(admin)
    .delete()
    .eq('user_id', targetUserId)
  if (pushError) {
    return { ok: false, error: 'Falha ao remover as assinaturas de push.' }
  }

  // Progresso de conquistas do dependente (morre com a conta, mas explícito).
  const { error: achievementsError } = await admin
    .from('dependent_achievements')
    .delete()
    .eq('profile_id', targetUserId)
  if (achievementsError) {
    return { ok: false, error: 'Falha ao remover o progresso de conquistas.' }
  }

  // Estatísticas de conquistas (contadores por perfil).
  const { error: statsError } = await admin
    .from('dependent_stats')
    .delete()
    .eq('profile_id', targetUserId)
  if (statsError) {
    return { ok: false, error: 'Falha ao remover as estatísticas do dependente.' }
  }

  // Imagens no Storage (best-effort).
  await deleteMemberStorage(admin, targetUserId)

  // Membresias (todas — dependente tem uma, mas o guard roda por segurança).
  const { error: membersError } = await admin
    .from('house_members')
    .delete()
    .eq('profile_id', targetUserId)
  if (membersError) {
    return { ok: false, error: 'Falha ao remover o vínculo do dependente.' }
  }

  // Perfil (e os pontos globais, que morrem com a conta).
  const { error: profileError } = await admin
    .from('profiles')
    .delete()
    .eq('id', targetUserId)
  if (profileError) {
    return { ok: false, error: 'Falha ao remover o perfil do dependente.' }
  }

  // Conta de autenticação (auth.users) — por último: se falhar, sobra uma conta
  // sem perfil que não passa nos checks de role (efetivamente descartada).
  const { error: authError } = await admin.auth.admin.deleteUser(targetUserId)
  if (authError) {
    return { ok: false, error: 'Falha ao remover a conta de login.' }
  }

  revalidatePath('/dashboard/admin')
  revalidatePath('/dashboard/admin/houses')
  revalidatePath('/tasks')
  revalidatePath('/rewards')

  return {
    ok: true,
    message: `Conta de "${targetName}" excluída permanentemente.`,
  }
}

/**
 * SÓ o AUTOR troca o PIN (houses.code) de convite da casa. Um novo código
 * único de 6 caracteres é gerado; o PIN antigo deixa de funcionar para novos
 * ingressos via `joinHouseByPin` — as membresias existentes não são afetadas.
 */
export async function rotateHousePin(
  houseId: string
): Promise<ActionResult<{ code: string }>> {
  const { user, profile } = await getSessionProfile()

  if (!user || profile?.user_role !== 'ADMIN') {
    return { ok: false, error: 'Apenas administradores podem trocar o PIN.' }
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return { ok: false, error: 'Configuração do servidor indisponível.' }
  }

  const house = await getOwnedHouse(admin, houseId, user.id)
  if (!house) {
    return { ok: false, error: 'Casa não encontrada ou você não é o autor dela.' }
  }

  let code: string
  try {
    code = await generateUniqueCode(admin)
  } catch {
    return { ok: false, error: 'Falha ao gerar um novo PIN.' }
  }

  const { error } = await admin.from('houses').update({ code }).eq('id', houseId)
  if (error) {
    return { ok: false, error: 'Falha ao trocar o PIN da casa.' }
  }

  revalidatePath('/dashboard/admin')
  revalidatePath('/dashboard/admin/houses')

  return { ok: true, message: `Novo PIN da casa: ${code}`, data: { code } }
}

/**
 * SÓ o AUTOR exclui a própria casa, e apenas quando ela está "vazia" — ele é
 * o ÚNICO membro restante. Os dados da casa (tarefas, recompensas, resgates,
 * sugestões, progresso de conquistas, conquistas, notificações, configurações,
 * assinaturas de push e membresias) são removidos em ordem explícita, sem
 * depender de cascade no banco. Perfis e pontos dos antigos membros são
 * globais e permanecem intactos.
 */
export async function deleteHouse(houseId: string): Promise<ActionResult> {
  const { user, profile } = await getSessionProfile()

  if (!user || profile?.user_role !== 'ADMIN') {
    return { ok: false, error: 'Apenas administradores podem excluir casas.' }
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return { ok: false, error: 'Configuração do servidor indisponível.' }
  }

  const house = await getOwnedHouse(admin, houseId, user.id)
  if (!house) {
    return { ok: false, error: 'Casa não encontrada ou você não é o autor dela.' }
  }

  const { count } = await admin
    .from('house_members')
    .select('id', { count: 'exact', head: true })
    .eq('house_id', houseId)

  if ((count ?? 0) > 1) {
    return {
      ok: false,
      error: 'Expulse os demais membros antes de excluir a casa.',
    }
  }

  const { error: tasksError } = await admin
    .from('tasks')
    .delete()
    .eq('house_id', houseId)
  if (tasksError) {
    return { ok: false, error: 'Falha ao excluir as tarefas da casa.' }
  }

  const { error: redemptionsError } = await admin
    .from('reward_redemptions')
    .delete()
    .eq('house_id', houseId)
  if (redemptionsError) {
    return { ok: false, error: 'Falha ao excluir os resgates da casa.' }
  }

  const { error: suggestionsError } = await admin
    .from('reward_suggestions')
    .delete()
    .eq('house_id', houseId)
  if (suggestionsError) {
    return { ok: false, error: 'Falha ao excluir as sugestões da casa.' }
  }

  // Progresso de conquistas dos dependentes, e as conquistas em si.
  const { error: dependentAchievementsError } = await admin
    .from('dependent_achievements')
    .delete()
    .eq('house_id', houseId)
  if (dependentAchievementsError) {
    return { ok: false, error: 'Falha ao excluir o progresso de conquistas.' }
  }

  // Estatísticas de conquistas dos dependentes da casa.
  const { error: statsError } = await admin
    .from('dependent_stats')
    .delete()
    .eq('house_id', houseId)
  if (statsError) {
    return { ok: false, error: 'Falha ao excluir as estatísticas da casa.' }
  }

  const { error: achievementsError } = await admin
    .from('achievements')
    .delete()
    .eq('house_id', houseId)
  if (achievementsError) {
    return { ok: false, error: 'Falha ao excluir as conquistas da casa.' }
  }

  const { error: rewardsError } = await admin
    .from('rewards')
    .delete()
    .eq('house_id', houseId)
  if (rewardsError) {
    return { ok: false, error: 'Falha ao excluir as recompensas da casa.' }
  }

  const { error: notificationsError } = await admin
    .from('notifications')
    .delete()
    .eq('house_id', houseId)
  if (notificationsError) {
    return { ok: false, error: 'Falha ao excluir as notificações da casa.' }
  }

  const { error: settingsError } = await admin
    .from('house_settings')
    .delete()
    .eq('house_id', houseId)
  if (settingsError) {
    return { ok: false, error: 'Falha ao excluir as configurações da casa.' }
  }

  // `push_subscriptions.house_id` é `on delete cascade` (docs/sql) — as
  // assinaturas de push da casa são removidas junto com a linha da casa.

  const { error: membersError } = await admin
    .from('house_members')
    .delete()
    .eq('house_id', houseId)
  if (membersError) {
    return { ok: false, error: 'Falha ao excluir os membros da casa.' }
  }

  const { error: houseError } = await admin
    .from('houses')
    .delete()
    .eq('id', houseId)
  if (houseError) {
    return { ok: false, error: 'Falha ao excluir a casa.' }
  }

  // Se a casa excluída era a ativa, desfaz o cookie para o fallback valer.
  const cookieStore = await cookies()
  if (cookieStore.get(ACTIVE_HOUSE_COOKIE)?.value === houseId) {
    cookieStore.set(ACTIVE_HOUSE_COOKIE, '', { maxAge: 0, path: '/' })
  }

  revalidatePath('/dashboard/admin')
  revalidatePath('/dashboard/admin/houses')
  revalidatePath('/tasks')
  revalidatePath('/rewards')

  return { ok: true, message: `Casa "${house.name}" excluída.` }
}
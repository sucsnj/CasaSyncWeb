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
import { validateCredentials } from './types'

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

  const { data: house } = await admin
    .from('houses')
    .select('id')
    .eq('id', houseId)
    .eq('owner_id', user.id)
    .maybeSingle()

  if (!house) {
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

export async function createDependent(
  fullName: string,
  email: string,
  password: string,
  houseId?: string
): Promise<ActionResult> {
  const name = fullName.trim()
  const normalizedEmail = email.trim().toLowerCase()

  if (!name) {
    return { ok: false, error: 'Informe o nome do dependente.' }
  }

  const validationError = validateCredentials(normalizedEmail, password)
  if (validationError) {
    return { ok: false, error: validationError }
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

  const admin = createAdminClient()

  let targetHouseId: string

  if (houseId) {
    // ENSINO (teach): validar a posse da casa no servidor (via service role)
    // impede que um ADMIN crie dependentes em casas que não lhe pertencem,
    // mesmo que o formulário/cliente seja adulterado.
    const { data: owned } = await admin
      .from('houses')
      .select('id')
      .eq('id', houseId)
      .eq('owner_id', user.id)
      .maybeSingle()

    if (!owned) {
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

  const { data: createdUser, error: createError } =
    await admin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: name,
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
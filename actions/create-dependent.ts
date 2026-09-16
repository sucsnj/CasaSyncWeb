'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import type { ActionResult } from './types'
import { validateCredentials } from './types'

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
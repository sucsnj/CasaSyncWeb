'use server'

import type { ActionResult } from './types'
import { validateCredentials } from './types'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

export async function registerAdmin(
  fullName: string,
  email: string,
  password: string
): Promise<ActionResult> {
  const name = fullName.trim()
  const normalizedEmail = email.trim().toLowerCase()

  if (!name) {
    return { ok: false, error: 'Informe o nome completo.' }
  }

  const validationError = validateCredentials(normalizedEmail, password)
  if (validationError) {
    return { ok: false, error: validationError }
  }

  const supabase = await createClient()

  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      data: {
        full_name: name,
        user_role: 'ADMIN',
      },
    },
  })

  if (error || !data.user) {
    return { ok: false, error: error?.message ?? 'Falha ao criar a conta.' }
  }

  const admin = createAdminClient()

  const { error: profileError } = await admin.from('profiles').upsert(
    {
      id: data.user.id,
      full_name: name,
      user_role: 'ADMIN',
    },
    { onConflict: 'id' }
  )

  if (profileError) {
    // Remove a conta recém-criada para evitar órfãos caso o perfil falhe.
    await admin.auth.admin.deleteUser(data.user.id)
    return { ok: false, error: 'Falha ao criar o perfil do administrador.' }
  }

  return { ok: true }
}
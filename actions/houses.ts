'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/utils/supabase/admin'
import {
  ACTIVE_HOUSE_COOKIE,
  getSessionProfile,
} from '@/utils/house'
import type { ActionResult } from './types'

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
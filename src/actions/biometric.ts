'use server'

import type { ActionResult } from './types'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

export async function restoreSessionFromRefreshToken(
  refreshToken: string
): Promise<ActionResult<{ redirectTo: string; refreshToken: string | null }>> {
  if (!refreshToken) {
    return { ok: false, error: 'Token de atualização ausente.' }
  }

  const supabase = await createClient()

  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: refreshToken,
  })

  if (error || !data.session || !data.user) {
    return { ok: false, error: 'Sessão expirada. Faça login novamente.' }
  }

  // Rotação: o Supabase emite um novo refresh_token; devolva-o para o cofre.
  const newRefreshToken = data.session.refresh_token ?? null

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return { ok: false, error: 'Configuração do servidor indisponível.' }
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('user_role')
    .eq('id', data.user.id)
    .maybeSingle()

  const redirectTo =
    profile?.user_role === 'ADMIN' ? '/dashboard/admin' : '/dashboard/dependent'

  revalidatePath(redirectTo)

  return {
    ok: true,
    data: { redirectTo, refreshToken: newRefreshToken },
  }
}

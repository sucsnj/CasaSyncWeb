import { cache } from 'react'
import { createAdminClient } from '@/utils/supabase/admin'
import { getSessionProfile } from '@/utils/house'

export type HouseRole = 'ADMIN' | 'DEPENDENT'

export type HouseAccess =
  | { ok: true; role: HouseRole; houseId: string; userId: string }
  | { ok: false }

/**
 * Escopo de tenant para as leituras consumidas pelo query cache (Fase 2).
 * A autorização deriva SEMPRE da sessão: o usuário precisa ser membro
 * (ADMIN co-fundador/co-gestor, ou DEPENDENT da casa) — mesmo modelo de
 * escopo dos reads via service role (ADR-0001/ADR-0006).
 */
export const assertHouseAccess = cache(
  async (houseId: string): Promise<HouseAccess> => {
    const { user, profile } = await getSessionProfile()
    if (!user || !profile) return { ok: false }

    const role: HouseRole = profile.user_role === 'ADMIN' ? 'ADMIN' : 'DEPENDENT'
    const admin = createAdminClient()

    const { data } = await admin
      .from('house_members')
      .select('role')
      .eq('house_id', houseId)
      .eq('profile_id', user.id)
      .maybeSingle()

    if (!data || data.role !== role) return { ok: false }

    return { ok: true, role, houseId, userId: user.id }
  }
)

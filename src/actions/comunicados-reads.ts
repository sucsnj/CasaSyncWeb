'use server'

import { createAdminClient } from '@/utils/supabase/admin'
import {
  getActiveAdminHouse,
  getSessionProfile,
} from '@/utils/house'
import { assertHouseAccess } from '@/utils/tenant-scope'
import type { Tables } from '@/types/database'

type Comunicado = Tables<'comunicados'>

export type ComunicadosBundle = {
  houseId: string
  comunicados: Comunicado[]
  confirmations: Record<string, number>
}

/**
 * Pacote para a tela de comunicados do ADMIN: a casa ativa + comunicados
 * lançados + a soma de confirmações por comunicado. Escopo derivado da
 * sessão (ADR-0006) — o cliente nunca passa `houseId`.
 */
export async function getComunicadosBundle(): Promise<ComunicadosBundle> {
  const { user, profile } = await getSessionProfile()
  if (!user || !profile) throw new Error('UNAUTHENTICATED')
  if (profile.user_role !== 'ADMIN') throw new Error('FORBIDDEN')

  const activeHouse = await getActiveAdminHouse()
  if (!activeHouse) throw new Error('NO_HOUSE')

  const access = await assertHouseAccess(activeHouse.id)
  if (!access.ok) throw new Error('FORBIDDEN')

  const houseId = access.houseId
  const admin = createAdminClient()

  const { data: comunicados, error: comunicadosError } = await admin
    .from('comunicados')
    .select('*')
    .eq('house_id', houseId)
    .order('created_at', { ascending: false })
  if (comunicadosError) throw new Error('READ_FAILED')

  const ids = (comunicados ?? []).map((comunicado) => comunicado.id)
  let confirmations: Record<string, number> = {}
  if (ids.length > 0) {
    const { data: deliveries, error: deliveriesError } = await admin
      .from('comunicado_deliveries')
      .select('comunicado_id, delivered_count')
      .in('comunicado_id', ids)
    if (deliveriesError) throw new Error('READ_FAILED')
    confirmations = (deliveries ?? []).reduce<Record<string, number>>(
      (acc, delivery) => {
        acc[delivery.comunicado_id] =
          (acc[delivery.comunicado_id] ?? 0) + delivery.delivered_count
        return acc
      },
      {}
    )
  }

  return {
    houseId,
    comunicados: comunicados ?? [],
    confirmations,
  }
}

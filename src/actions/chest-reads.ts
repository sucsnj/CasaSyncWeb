'use server'

import { createAdminClient } from '@/utils/supabase/admin'
import {
  getHouseAttachmentBudgetSettings,
  getHouseAttachmentSettings,
} from '@/utils/house-settings'
import { houseAttachmentBytes } from '@/utils/attachment-usage'
import { assertHouseAccess } from '@/utils/tenant-scope'
import type { ChestItemView } from '@/components/chest/chest-types'

export type ChestAdminBundle = {
  role: 'ADMIN'
  houseId: string
  items: ChestItemView[]
  maxMb: number
  usageBytes: number
  attachmentsAllowed: boolean
}

export type ChestDependentBundle = {
  role: 'DEPENDENT'
  houseId: string
  items: ChestItemView[]
  attachmentsAllowed: boolean
}

export type ChestBundle = ChestAdminBundle | ChestDependentBundle

export async function listChest(houseId: string): Promise<ChestBundle> {
  const access = await assertHouseAccess(houseId)
  if (!access.ok) throw new Error('FORBIDDEN')

  const admin = createAdminClient()

  if (access.role === 'ADMIN') {
    const [{ data: items }, attachmentBudget, attachments, usageBytes] =
      await Promise.all([
        admin
          .from('chest_items')
          .select('*')
          .eq('house_id', houseId)
          .order('created_at', { ascending: false }),
        getHouseAttachmentBudgetSettings(houseId),
        getHouseAttachmentSettings(houseId),
        houseAttachmentBytes(admin, houseId).catch(() => 0),
      ])

    return {
      role: 'ADMIN',
      houseId,
      items: (items ?? []) as ChestItemView[],
      maxMb: attachmentBudget.maxMb,
      usageBytes,
      attachmentsAllowed: attachments.chestAllowed,
    }
  }

  const { data: items } = await admin
    .from('chest_items')
    .select('*')
    .eq('house_id', houseId)
    .order('created_at', { ascending: false })

  // A casa desligou os anexos do baú? (ADR-0026) — o item continua listado,
  // mas o arquivo não abre.
  const { chestAllowed } = await getHouseAttachmentSettings(houseId)

  return {
    role: 'DEPENDENT',
    houseId,
    items: (items ?? []) as ChestItemView[],
    attachmentsAllowed: chestAllowed,
  }
}

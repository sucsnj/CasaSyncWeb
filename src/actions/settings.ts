'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/utils/supabase/admin'
import { getActiveAdminHouse, getSessionProfile } from '@/utils/house'
import {
  DEFAULT_QUICK_MESSAGE,
  DEFAULT_REWARD_PRICING,
  type HouseSettingsKey,
  type QuickMessageSettings,
  type RewardPricingSettings,
} from '@/utils/settings'
import type { ActionResult } from './types'

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * ADMIN salva a configuração de uma chave da casa ativa. A autorização é
 * derivada da sessão + membresia ADMIN (nunca do cliente) — mesmo padrão de
 * `assertAdminCanManage`. A escrita é um upsert por `(house_id, key)` com
 * `value` jsonb.
 */
export async function updateHouseSettings(
  key: HouseSettingsKey,
  patch: Record<string, unknown>
): Promise<ActionResult> {
  const activeHouse = await getActiveAdminHouse()
  if (!activeHouse) return { ok: false, error: 'Selecione uma casa primeiro.' }

  const { user, profile } = await getSessionProfile()
  if (!user || profile?.user_role !== 'ADMIN') {
    return { ok: false, error: 'Apenas administradores podem configurar a casa.' }
  }

  const admin = createAdminClient()

  const { data: membership } = await admin
    .from('house_members')
    .select('id')
    .eq('house_id', activeHouse.id)
    .eq('profile_id', user.id)
    .eq('role', 'ADMIN')
    .maybeSingle()

  if (!membership) {
    return { ok: false, error: 'Casa não encontrada ou sem permissão.' }
  }

  const value = validateSettings(key, patch)
  if (!value.ok) return value

  const { error } = await admin.from('house_settings').upsert(
    {
      house_id: activeHouse.id,
      key,
      value: value.value,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'house_id,key' }
  )

  if (error) {
    console.error('[SETTINGS] Falha ao salvar configuração:', error)
    return { ok: false, error: 'Falha ao salvar as configurações.' }
  }

  revalidatePath('/dashboard/admin/settings')
  if (key === 'quick_message') {
    revalidatePath('/tasks')
    revalidatePath('/rewards')
    revalidatePath('/dashboard/dependent')
  }

  return { ok: true, message: 'Configurações salvas.' }
}

/**
 * Valida o jsonb da chave e devolve o valor já normalizado caindo no default
 * para campos ausentes. Não confia em campos desconhecidos (partida limpa a
 * partir dos defaults).
 */
function validateSettings(
  key: HouseSettingsKey,
  patch: Record<string, unknown>
): SettingsResult {
  if (key === 'reward_pricing') {
    return validateRewardPricing(patch)
  }
  return validateQuickMessage(patch)
}

type SettingsResult =
  | { ok: true; value: RewardPricingSettings | QuickMessageSettings }
  | { ok: false; error: string }

function validateRewardPricing(patch: Record<string, unknown>): SettingsResult {
  const base = { ...DEFAULT_REWARD_PRICING }

  const enabled = patch.enabled ?? base.enabled
  if (typeof enabled !== 'boolean') {
    return { ok: false, error: 'O toggle de aumento deve ser ligado ou desligado.' }
  }
  base.enabled = enabled

  const noIncreaseMax = patch.noIncreaseMax ?? base.noIncreaseMax
  if (!isFiniteNumber(noIncreaseMax) || !Number.isInteger(noIncreaseMax) || noIncreaseMax < 0) {
    return { ok: false, error: 'O limite de recompensas que não encarecem deve ser um inteiro >= 0.' }
  }

  const midMax = patch.midMax ?? base.midMax
  if (!isFiniteNumber(midMax) || !Number.isInteger(midMax) || midMax <= noIncreaseMax) {
    return { ok: false, error: 'O limite da faixa menor (<= 200) deve ser maior que o limite de não-aumento.' }
  }

  const midRate = patch.midRate ?? base.midRate
  if (!isFiniteNumber(midRate) || midRate <= 0 || midRate > 1) {
    return { ok: false, error: 'A taxa da faixa menor deve estar entre 0 e 1 (ex.: 0.03 = 3%).' }
  }

  const highRate = patch.highRate ?? base.highRate
  if (!isFiniteNumber(highRate) || highRate <= 0 || highRate > 1) {
    return { ok: false, error: 'A taxa da faixa maior deve estar entre 0 e 1 (ex.: 0.02 = 2%).' }
  }

  const minBump = patch.minBump ?? base.minBump
  if (!isFiniteNumber(minBump) || !Number.isInteger(minBump) || minBump < 1) {
    return { ok: false, error: 'O aumento mínimo deve ser um inteiro >= 1.' }
  }

  base.noIncreaseMax = noIncreaseMax
  base.midMax = midMax
  base.midRate = midRate
  base.highRate = highRate
  base.minBump = minBump

  return { ok: true, value: base }
}

function validateQuickMessage(patch: Record<string, unknown>): SettingsResult {
  const base = { ...DEFAULT_QUICK_MESSAGE }

  const maxChars = patch.maxChars ?? base.maxChars
  if (!isFiniteNumber(maxChars) || !Number.isInteger(maxChars) || maxChars < 1 || maxChars > 2000) {
    return { ok: false, error: 'O limite de caracteres deve estar entre 1 e 2000.' }
  }

  const maxImageMb = patch.maxImageMb ?? base.maxImageMb
  if (!isFiniteNumber(maxImageMb) || !Number.isInteger(maxImageMb) || maxImageMb < 1 || maxImageMb > 50) {
    return { ok: false, error: 'O limite de imagem deve estar entre 1 e 50 MB.' }
  }

  const capacity = patch.capacity ?? base.capacity
  if (!isFiniteNumber(capacity) || !Number.isInteger(capacity) || capacity < 1 || capacity > 50) {
    return { ok: false, error: 'A capacidade acumulada deve estar entre 1 e 50.' }
  }

  base.maxChars = maxChars
  base.maxImageMb = maxImageMb
  base.capacity = capacity

  return { ok: true, value: base }
}
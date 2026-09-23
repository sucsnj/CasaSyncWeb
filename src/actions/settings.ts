'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/utils/supabase/admin'
import { getActiveAdminHouse, getSessionProfile } from '@/utils/house'
import {
  DEFAULT_EXTENSION_RULES,
  DEFAULT_NOTIFICATION_RETENTION,
  DEFAULT_QUICK_MESSAGE,
  DEFAULT_REWARD_PRICING,
  DEFAULT_TASK_DECAY,
  DEFAULT_TASK_SLA,
  type ExtensionRulesSettings,
  type HouseSettingsKey,
  type NotificationRetentionSettings,
  type QuickMessageSettings,
  type RewardPricingSettings,
  type TaskDecaySettings,
  type TaskSlaSettings,
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
  if (key === 'task_sla' || key === 'extension_rules' || key === 'task_decay') {
    revalidatePath('/tasks')
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
  if (key === 'reward_pricing') return validateRewardPricing(patch)
  if (key === 'quick_message') return validateQuickMessage(patch)
  if (key === 'task_sla') return validateTaskSla(patch)
  if (key === 'extension_rules') return validateExtensionRules(patch)
  if (key === 'task_decay') return validateTaskDecay(patch)
  return validateNotificationRetention(patch)
}

type SettingsResult =
  | {
      ok: true
      value:
        | RewardPricingSettings
        | QuickMessageSettings
        | TaskSlaSettings
        | ExtensionRulesSettings
        | NotificationRetentionSettings
        | TaskDecaySettings
    }
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

  const readRetentionDays = patch.readRetentionDays ?? base.readRetentionDays
  if (!isFiniteNumber(readRetentionDays) || !Number.isInteger(readRetentionDays) || readRetentionDays < 1 || readRetentionDays > 365) {
    return { ok: false, error: 'A retenção (dias) deve ser um inteiro entre 1 e 365.' }
  }

  base.maxChars = maxChars
  base.maxImageMb = maxImageMb
  base.capacity = capacity
  base.readRetentionDays = readRetentionDays

  return { ok: true, value: base }
}

function validateTaskSla(patch: Record<string, unknown>): SettingsResult {
  const base = { ...DEFAULT_TASK_SLA }

  const defaultDueDays = patch.defaultDueDays ?? base.defaultDueDays
  if (!isFiniteNumber(defaultDueDays) || !Number.isInteger(defaultDueDays) || defaultDueDays < 0 || defaultDueDays > 365) {
    return { ok: false, error: 'O prazo padrão deve ser um inteiro entre 0 e 365 dias.' }
  }

  const dueSoonHours = patch.dueSoonHours ?? base.dueSoonHours
  if (!isFiniteNumber(dueSoonHours) || !Number.isInteger(dueSoonHours) || dueSoonHours < 0 || dueSoonHours > 8760) {
    return { ok: false, error: 'As horas do "Prazo próximo" devem ser um inteiro entre 0 e 8760 (0 = desliga o aviso).' }
  }

  base.defaultDueDays = defaultDueDays
  base.dueSoonHours = dueSoonHours

  return { ok: true, value: base }
}

function validateExtensionRules(patch: Record<string, unknown>): SettingsResult {
  const raw = patch.dayOptions ?? DEFAULT_EXTENSION_RULES.dayOptions

  if (
    !Array.isArray(raw) ||
    raw.length < 1 ||
    raw.length > 5 ||
    raw.some(
      (d) => !isFiniteNumber(d) || !Number.isInteger(d) || (d as number) < 1 || (d as number) > 90
    )
  ) {
    return { ok: false, error: 'Informe de 1 a 5 opções de dias (inteiros entre 1 e 90).' }
  }

  const dayOptions = [...new Set(raw as number[])].sort((a, b) => a - b)
  if (dayOptions.length !== (raw as number[]).length) {
    return { ok: false, error: 'As opções de dias devem ser todas diferentes entre si.' }
  }

  return { ok: true, value: { dayOptions } }
}

function validateNotificationRetention(patch: Record<string, unknown>): SettingsResult {
  const base = { ...DEFAULT_NOTIFICATION_RETENTION }

  const readRetentionDays = patch.readRetentionDays ?? base.readRetentionDays
  if (!isFiniteNumber(readRetentionDays) || !Number.isInteger(readRetentionDays) || readRetentionDays < 1 || readRetentionDays > 365) {
    return { ok: false, error: 'A retenção deve ser um inteiro entre 1 e 365 dias.' }
  }

  base.readRetentionDays = readRetentionDays

  return { ok: true, value: base }
}

function validateTaskDecay(patch: Record<string, unknown>): SettingsResult {
  const base = { ...DEFAULT_TASK_DECAY }

  const enabled = patch.enabled ?? base.enabled
  if (typeof enabled !== 'boolean') {
    return { ok: false, error: 'O toggle de decaimento deve ser ligado ou desligado.' }
  }
  base.enabled = enabled

  const periodHours = patch.periodHours ?? base.periodHours
  if (!isFiniteNumber(periodHours) || !Number.isInteger(periodHours) || periodHours < 1 || periodHours > 8760) {
    return { ok: false, error: 'O período deve ser um inteiro entre 1 e 8760 horas (1 ano).' }
  }

  const pointsPerPeriod = patch.pointsPerPeriod ?? base.pointsPerPeriod
  if (!isFiniteNumber(pointsPerPeriod) || !Number.isInteger(pointsPerPeriod) || pointsPerPeriod < 1 || pointsPerPeriod > 1000) {
    return { ok: false, error: 'Os pontos por período devem ser um inteiro entre 1 e 1000.' }
  }

  base.periodHours = periodHours
  base.pointsPerPeriod = pointsPerPeriod

  return { ok: true, value: base }
}
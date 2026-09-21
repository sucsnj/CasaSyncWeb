import { cache } from 'react'
import { createAdminClient } from '@/utils/supabase/admin'
import {
  DEFAULT_QUICK_MESSAGE,
  DEFAULT_REWARD_PRICING,
  mergeSettings,
  type HouseSettingsKey,
  type QuickMessageSettings,
  type RewardPricingSettings,
} from '@/utils/settings'

type SettingsRow = { value: Record<string, unknown> | null }

/**
 * Lê o jsonb de uma chave de configuração da casa via service role (o escopo
 * é SEMPRE derivado da sessão pelo chamador: casa ativa do ADMIN ou casa do
 * dependente). Linha ausente cai no default — `mergeSettings` garante que
 * campos omitidos/novos também caiam no default.
 */
async function getHouseSettingsValue(
  houseId: string,
  key: HouseSettingsKey
): Promise<Record<string, unknown> | null> {
  const admin = createAdminClient()

  const { data } = await admin
    .from('house_settings')
    .select('value')
    .eq('house_id', houseId)
    .eq('key', key)
    .maybeSingle<SettingsRow>()

  return data?.value ?? null
}

/** Configuração de encarecimento automático de recompensas da casa. */
export const getHouseRewardPricingSettings = cache(
  async (houseId: string): Promise<RewardPricingSettings> => {
    const value = await getHouseSettingsValue(houseId, 'reward_pricing')
    return mergeSettings(value, DEFAULT_REWARD_PRICING)
  }
)

/** Configuração de mensagem rápida da casa. */
export const getHouseQuickMessageSettings = cache(
  async (houseId: string): Promise<QuickMessageSettings> => {
    const value = await getHouseSettingsValue(houseId, 'quick_message')
    return mergeSettings(value, DEFAULT_QUICK_MESSAGE)
  }
)
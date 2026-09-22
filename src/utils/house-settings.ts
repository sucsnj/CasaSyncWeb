import { cache } from 'react'
import { createAdminClient } from '@/utils/supabase/admin'
import {
  DEFAULT_EXTENSION_RULES,
  DEFAULT_NOTIFICATION_RETENTION,
  DEFAULT_QUICK_MESSAGE,
  DEFAULT_REWARD_PRICING,
  DEFAULT_TASK_DECAY,
  DEFAULT_TASK_SLA,
  mergeSettings,
  type ExtensionRulesSettings,
  type HouseSettingsKey,
  type NotificationRetentionSettings,
  type QuickMessageSettings,
  type RewardPricingSettings,
  type TaskDecaySettings,
  type TaskSlaSettings,
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

/** Configuração de prazos/SLA de tarefas da casa. */
export const getHouseTaskSlaSettings = cache(
  async (houseId: string): Promise<TaskSlaSettings> => {
    const value = await getHouseSettingsValue(houseId, 'task_sla')
    return mergeSettings(value, DEFAULT_TASK_SLA)
  }
)

/** Regras de adiamento de tarefas da casa. */
export const getHouseExtensionRulesSettings = cache(
  async (houseId: string): Promise<ExtensionRulesSettings> => {
    const value = await getHouseSettingsValue(houseId, 'extension_rules')
    return mergeSettings(value, DEFAULT_EXTENSION_RULES)
  }
)

/** Retenção das notificações comuns da casa. */
export const getHouseNotificationRetentionSettings = cache(
  async (houseId: string): Promise<NotificationRetentionSettings> => {
    const value = await getHouseSettingsValue(houseId, 'notification_retention')
    return mergeSettings(value, DEFAULT_NOTIFICATION_RETENTION)
  }
)

/** Decaimento de pontos de tarefas da casa. */
export const getHouseTaskDecaySettings = cache(
  async (houseId: string): Promise<TaskDecaySettings> => {
    const value = await getHouseSettingsValue(houseId, 'task_decay')
    return mergeSettings(value, DEFAULT_TASK_DECAY)
  }
)
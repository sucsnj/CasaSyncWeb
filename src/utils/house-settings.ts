import { cache } from 'react'
import { createAdminClient } from '@/utils/supabase/admin'
import {
  DEFAULT_EXTENSION_RULES,
  DEFAULT_HOUSE_TIMEZONE_SETTINGS,
  DEFAULT_NOTIFICATION_MUTE,
  DEFAULT_NOTIFICATION_RETENTION,
  DEFAULT_QUICK_MESSAGE,
  DEFAULT_REWARD_PRICING,
  DEFAULT_TASK_DECAY,
  DEFAULT_TASK_RULES,
  DEFAULT_TASK_SLA,
  mergeSettings,
  type ExtensionRulesSettings,
  type HouseSettingsKey,
  type HouseTimezoneSettings,
  type NotificationMuteSettings,
  type NotificationRetentionSettings,
  type QuickMessageSettings,
  type RewardPricingSettings,
  type TaskDecaySettings,
  type TaskRulesSettings,
  type TaskSlaSettings,
} from '@/utils/settings'
import { DEFAULT_HOUSE_TIMEZONE, isValidTimeZone } from '@/utils/timezone'
import { timeServer } from '@/utils/perf'

type SettingsRow = { key: HouseSettingsKey; value: Record<string, unknown> | null }

/**
 * Todas as configurações da casa em UMA leitura: `key -> value`.
 *
 * Antes cada getter fazia sua própria consulta (`.eq('key', key)`), então as 9
 * chaves viravam 9 idas ao banco — e o `React.cache` de cada getter não ajudava
 * entre chaves diferentes. Pior: em `/tasks` as 3 chaves usadas (`task_sla`,
 * `extension_rules`, `task_decay`) eram awaited em SEQUÊNCIA, então 3 round-trips
 * em série no caminho crítico para ler 3 linhas da mesma tabela.
 *
 * Com o mapa, a casa é lida 1× por request e todas as chaves saem de memória.
 * O escopo continua derivado da sessão pelo chamador (casa ativa do ADMIN ou casa
 * do dependente) — aqui só se troca o *como* a linha é buscada.
 */
const getHouseSettingsMap = cache(
  async (houseId: string): Promise<Map<HouseSettingsKey, Record<string, unknown> | null>> => {
    const admin = createAdminClient()

    // Medido por instrumentação TEMPORÁRIA (ver `src/utils/perf.ts`): deve sair
    // **1 linha por casa por request** (era 1 por chave), mesmo com as 9 chaves em
    // uso. Se aparecer repetido no mesmo request, o `React.cache` perdeu o efeito.
    const { data } = await timeServer('settings/leitura', () =>
      admin.from('house_settings').select('key, value').eq('house_id', houseId)
    )

    const map = new Map<HouseSettingsKey, Record<string, unknown> | null>()
    for (const row of (data ?? []) as SettingsRow[]) {
      map.set(row.key, row.value ?? null)
    }
    return map
  }
)

/**
 * Lê o jsonb de uma chave de configuração da casa. Linha ausente cai no default
 * no getter que consome (`mergeSettings` garante que campos omitidos/novos também
 * caiam no default).
 */
async function getHouseSettingsValue(
  houseId: string,
  key: HouseSettingsKey
): Promise<Record<string, unknown> | null> {
  const map = await getHouseSettingsMap(houseId)
  return map.get(key) ?? null
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

/**
 * Categorias de notificação que a casa silenciou (`true` = silenciada). Lida por
 * `notifyUser`/`notifyHouse` para decidir se o evento é entregue ou descartado.
 */
export const getHouseNotificationMuteSettings = cache(
  async (houseId: string): Promise<NotificationMuteSettings> => {
    const value = await getHouseSettingsValue(houseId, 'notification_mute')
    return mergeSettings(value, DEFAULT_NOTIFICATION_MUTE)
  }
)

/** Limites de tarefas da casa (teto de pontos e de tarefas ativas). */
export const getHouseTaskRulesSettings = cache(
  async (houseId: string): Promise<TaskRulesSettings> => {
    const value = await getHouseSettingsValue(houseId, 'task_rules')
    return mergeSettings(value, DEFAULT_TASK_RULES)
  }
)

/**
 * Fuso horário da casa. Lido pelos dois lugares que dependem de "que horas são
 * lá": o agendamento dos comunicados (`getDueComunicados`) e o dia-contagem da
 * Streak (`registerLoginDay`).
 */
export const getHouseTimezoneSettings = cache(
  async (houseId: string): Promise<HouseTimezoneSettings> => {
    const value = await getHouseSettingsValue(houseId, 'house_timezone')
    const merged = mergeSettings(value, DEFAULT_HOUSE_TIMEZONE_SETTINGS)
    // Linha gravada com fuso que o runtime não conhece (ou nunca existiu) cai
    // no default — nunca propaga um fuso quebrado para o cálculo do agenda.
    return {
      timezone: isValidTimeZone(merged.timezone)
        ? merged.timezone
        : DEFAULT_HOUSE_TIMEZONE,
    }
  }
)

/** Decaimento de pontos de tarefas da casa. */
export const getHouseTaskDecaySettings = cache(
  async (houseId: string): Promise<TaskDecaySettings> => {
    const value = await getHouseSettingsValue(houseId, 'task_decay')
    return mergeSettings(value, DEFAULT_TASK_DECAY)
  }
)
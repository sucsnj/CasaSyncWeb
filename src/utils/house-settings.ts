import { cache } from 'react'
import { createAdminClient } from '@/utils/supabase/admin'
import {
  DEFAULT_ATTACHMENTS,
  DEFAULT_CHEST_RULES,
  DEFAULT_EXTENSION_RULES,
  DEFAULT_HOUSE_TIMEZONE_SETTINGS,
  DEFAULT_NOTIFICATION_MUTE,
  DEFAULT_NOTIFICATION_RETENTION,
  DEFAULT_QUICK_MESSAGE,
  DEFAULT_REWARD_PRICING,
  DEFAULT_TASK_DECAY,
  DEFAULT_TASK_RULES,
  DEFAULT_TASK_SLA,
  DEFAULT_TEXT_LIMITS,
  mergeSettings,
  type AttachmentSettings,
  type ChestRulesSettings,
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
  type TextLimitsSettings,
} from '@/utils/settings'
import { DEFAULT_HOUSE_TIMEZONE, isValidTimeZone } from '@/utils/timezone'

type SettingsRow = { key: HouseSettingsKey; value: Record<string, unknown> | null }

/**
 * Lê um campo booleano da configuração com fallback: só `true`/`false` aceitos.
 * Qualquer outra coisa (string, número, `null`, campo ausente) usa o default — o
 * jsonb é gravado por action validada, mas a leitura não pode depender disso.
 */
function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

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

    // Uma linha por casa por request (era uma por chave): confirmado em produção
    // pela instrumentação de latência (`n=21, mediana 82ms, uma por request`).
    const { data } = await admin
      .from('house_settings')
      .select('key, value')
      .eq('house_id', houseId)

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
 * Limite de itens do baú da casa (ADR-0024). Lido pelo `createChestItem` (que
 * recusa o item acima do teto) e pelo card de Configurações, que mostra
 * "N de M itens".
 */
export const getHouseChestRulesSettings = cache(
  async (houseId: string): Promise<ChestRulesSettings> => {
    const value = await getHouseSettingsValue(houseId, 'chest_rules')
    return mergeSettings(value, DEFAULT_CHEST_RULES)
  }
)

/**
 * Anexos da casa (ADR-0026). Lida nas actions de tarefa e de baú (para recusar
 * anexo quando a casa desligou), nas rotas `/api/...` do anexo (recusar leitura com
 * 403) e na tela `/abrir-anexo` (pular o aviso). Sai da **mesma** leitura por casa
 * das outras chaves — o toggle não cria round-trip novo.
 */
export const getHouseAttachmentSettings = cache(
  async (houseId: string): Promise<AttachmentSettings> => {
    const value = await getHouseSettingsValue(houseId, 'attachments')
    // Fail-closed no tipo: um valor gravado que não seja booleano cai no default
    // (ligado) em vez de virar um `undefined` que silenciosamente *liberta* o
    // anexo. O que barra é o servidor, então liberar por leitura suja seria o pior
    // dos dois erros.
    const merged = mergeSettings(value, DEFAULT_ATTACHMENTS)
    return {
      tasksAllowed: readBoolean(merged.tasksAllowed, DEFAULT_ATTACHMENTS.tasksAllowed),
      chestAllowed: readBoolean(merged.chestAllowed, DEFAULT_ATTACHMENTS.chestAllowed),
      htmlWarning: readBoolean(merged.htmlWarning, DEFAULT_ATTACHMENTS.htmlWarning),
    }
  }
)

/**
 * Anexos de **várias casas em UMA consulta** — existe para o form do baú, que
 * deixa o ADMIN escolher a casa do item (ADR-0026).
 *
 * Por que não `getHouseAttachmentSettings` em cima de cada casa: o getter é
 * memoizado por `(casa)`, então um ADMIN de 3 casas custaria **3 leituras** do
 * mesmo `house_settings`. Aqui é uma consulta só com `.in('house_id', …)`, e o
 * group-by sai no próprio JS — o número de round-trips não cresce com o número de
 * casas (regra do `AGENTS.md` §3: contar round-trips, não estimar).
 *
 * `houseIds` vazio → mapa vazio **sem** consulta.
 */
export const getHousesAttachmentSettings = cache(
  async (houseIds: string[]): Promise<Map<string, AttachmentSettings>> => {
    const result = new Map<string, AttachmentSettings>()
    if (houseIds.length === 0) return result

    const admin = createAdminClient()
    const { data } = await admin
      .from('house_settings')
      .select('house_id, value')
      .eq('key', 'attachments')
      .in('house_id', houseIds)

    const byHouse = new Map<string, Record<string, unknown> | null>()
    for (const row of (data ?? []) as Array<{ house_id: string; value: unknown }>) {
      byHouse.set(
        row.house_id,
        (row.value ?? null) as Record<string, unknown> | null
      )
    }

    // Casa sem linha (ou com linha suja) cai no default — **ligado**, que é o que
    // preserva o comportamento de toda casa que não configurou nada.
    for (const houseId of houseIds) {
      const merged = mergeSettings(byHouse.get(houseId), DEFAULT_ATTACHMENTS)
      result.set(houseId, {
        tasksAllowed: readBoolean(merged.tasksAllowed, DEFAULT_ATTACHMENTS.tasksAllowed),
        chestAllowed: readBoolean(merged.chestAllowed, DEFAULT_ATTACHMENTS.chestAllowed),
        htmlWarning: readBoolean(merged.htmlWarning, DEFAULT_ATTACHMENTS.htmlWarning),
      })
    }

    return result
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

/**
 * Limite de caracteres das descrições (tarefa, recompensa, conquista). Lido pelas
 * actions no caminho de escrita (validação fail-closed) e repassado às telas
 * para o `maxLength`/contador do formulário.
 */
export const getHouseTextLimitsSettings = cache(
  async (houseId: string): Promise<TextLimitsSettings> => {
    const value = await getHouseSettingsValue(houseId, 'text_limits')
    return mergeSettings(value, DEFAULT_TEXT_LIMITS)
  }
)
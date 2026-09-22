/**
 * Configurações da casa (menu do ADMIN).
 *
 * Arquivo sem dependências de servidor para ser importado por cliente e
 * server. Os valores armazenados em `house_settings` são um `jsonb` por chave;
 * `mergeSettings` garante que campos novos/omitidos caiam no default.
 */
import {
  QUICK_MESSAGE_CAPACITY,
  QUICK_MESSAGE_MAX_CHARS,
  QUICK_MESSAGE_MAX_IMAGE_MB,
} from '@/utils/quick-message'

export type HouseSettingsKey =
  | 'reward_pricing'
  | 'quick_message'
  | 'task_sla'
  | 'extension_rules'
  | 'notification_retention'

/** Encarecimento automático de recompensas a cada resgate aprovado. */
export type RewardPricingSettings = {
  /** ON/OFF do aumento automático para toda a casa. */
  enabled: boolean
  /** Recompensas com custo <= este valor NUNCA encarecem. */
  noIncreaseMax: number
  /** Custo limite da faixa menor (abaixo dele aplica `midRate`). */
  midMax: number
  /** Taxa para custos entre `noIncreaseMax+1` e `midMax`. */
  midRate: number
  /** Taxa para custos acima de `midMax`. */
  highRate: number
  /** Piso de aumento em pontos quando encarece (nunca fica igual). */
  minBump: number
}

/** Mensagem rápida (DEPENDENT → ADMIN). */
export type QuickMessageSettings = {
  maxChars: number
  maxImageMb: number
  /** Máximo de mensagens próprias acumuladas para poder enviar. */
  capacity: number
}

export const DEFAULT_REWARD_PRICING: RewardPricingSettings = {
  enabled: true,
  noIncreaseMax: 25,
  midMax: 200,
  midRate: 0.03,
  highRate: 0.02,
  minBump: 1,
}

export const DEFAULT_QUICK_MESSAGE: QuickMessageSettings = {
  maxChars: QUICK_MESSAGE_MAX_CHARS,
  maxImageMb: QUICK_MESSAGE_MAX_IMAGE_MB,
  capacity: QUICK_MESSAGE_CAPACITY,
}

/** Prazos/SLA de tarefas. */
export type TaskSlaSettings = {
  /** Prazo padrão de criação/restauro da tarefa (dias a partir de agora). */
  defaultDueDays: number
  /**
   * Horas restantes até o prazo que acendem o chip "Prazo próximo"
   * (ex.: 4 = faltando menos de 4h para o prazo). Sempre em horas, absoluto
   * (independe do tamanho total da tarefa). 0 desliga o aviso.
   */
  dueSoonHours: number
}

/**
 * Regras de adiamento de tarefas. Apenas os dias oferecidos nos botões de
 * aprovação — a mecânica de "máximo de adiamentos por tarefa" ficou de fora
 * (decisão de produto, ver PROJECT_STATUS.md).
 */
export type ExtensionRulesSettings = {
  /** Dias disponíveis nos botões "Aprovar (+N dias)" do ADMIN. */
  dayOptions: number[]
}

/** Retenção das notificações comuns (a QUICK_MESSAGE tem regra própria). */
export type NotificationRetentionSettings = {
  /** Dias até apagar uma notificação comum já lida (limpeza lazy). */
  readRetentionDays: number
}

export const DEFAULT_TASK_SLA: TaskSlaSettings = {
  defaultDueDays: 1,
  dueSoonHours: 4,
}

export const DEFAULT_EXTENSION_RULES: ExtensionRulesSettings = {
  dayOptions: [1, 3],
}

export const DEFAULT_NOTIFICATION_RETENTION: NotificationRetentionSettings = {
  readRetentionDays: 5,
}

export function mergeSettings<T extends Record<string, unknown>>(
  value: Record<string, unknown> | T | null | undefined,
  defaults: T
): T {
  return { ...defaults, ...(value ?? {}) }
}
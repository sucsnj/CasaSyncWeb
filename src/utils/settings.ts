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

export type HouseSettingsKey = 'reward_pricing' | 'quick_message'

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

export function mergeSettings<T extends Record<string, unknown>>(
  value: Record<string, unknown> | T | null | undefined,
  defaults: T
): T {
  return { ...defaults, ...(value ?? {}) }
}
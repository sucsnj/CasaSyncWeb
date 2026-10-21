/**
 * Módulo puro dos LIMITADORES DE RESGATE das recompensas.
 *
 * Cada recompensa pode ter dois tetos, ambos **por dependente**:
 * - `daily_limit` — quantos resgates no dia corrente;
 * - `monthly_limit` — quantos resgates no mês corrente.
 *
 * Regra única para os dois campos: **0 (ou campo vazio) = ilimitado**. É a
 * mesma convenção das outras chaves de configuração (`house_settings`).
 *
 * A janela (dia/mês) é a do **fuso da casa** (chave `house_timezone`) — quem
 * decide o dia é a casa, não o fuso do aparelho do dependente. Por isso as
 * fronteiras são calculadas no servidor (`utils/timezone.ts`) e repassadas
 * como instante; aqui só entra a contagem e a apresentação.
 *
 * Módulo puro (sem `'use server'`): as actions e os client components
 * importam daqui.
 */

/** `daily_limit`/`monthly_limit` = 0 → resgates ilimitados. */
export const REWARD_LIMIT_UNLIMITED = 0

/**
 * Status de resgate que **consomem** o limite: o pedido pendente já ocupa a
 * vaga (o dependente está esperando a aprovação) e o aprovado consumiu de
 * fato. Um resgate **recusado** pelo ADMIN não consome — a recompensa não foi
 * entregue e os pontos voltaram.
 */
export const REWARD_LIMIT_COUNTED_STATUSES = ['PENDING', 'APPROVED'] as const

export type RewardLimitPeriod = 'dia' | 'mês'

/**
 * O limite é ilimitado? (`0` = ilimitado).
 *
 * Aceita `undefined`/`null` de propósito: quando o SQL dos limitadores ainda
 * não foi aplicado no banco, o `select('*')` das recompensas não devolve as
 * colunas e o valor chega `undefined` — que precisa valer como **ilimitado**
 * (a loja continua funcionando, sem teto) e não como "limite 0 reached".
 */
export function isRewardUnlimited(
  limit: number | undefined | null
): boolean {
  if (limit === undefined || limit === null) return true
  return limit <= REWARD_LIMIT_UNLIMITED
}

/**
 * Valida um limite informado pelo ADMIN (fail-closed): inteiro >= 0.
 * Campo vazio vira 0 (ilimitado) — o formulário manda `Number('')` = 0.
 */
export function validateRewardLimit(
  value: unknown,
  label: string
): string | null {
  if (value === undefined || value === null || value === '') return null
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) {
    return `O limite ${label} deve ser um número inteiro.`
  }
  if (parsed < 0) {
    return `O limite ${label} não pode ser negativo (0 = ilimitado).`
  }
  return null
}

/**
 * Rótulo curto do limite para os cards: "2/dia", "3/mês" ou `null` (quando
 * os dois campos estão ilimitados).
 */
export function rewardLimitLabel(
  dailyLimit: number | undefined | null,
  monthlyLimit: number | undefined | null
): string | null {
  const parts: string[] = []
  if (!isRewardUnlimited(dailyLimit)) parts.push(`${dailyLimit}/dia`)
  if (!isRewardUnlimited(monthlyLimit)) parts.push(`${monthlyLimit}/mês`)
  if (parts.length === 0) return null
  return parts.join(' · ')
}

/** Redemption mínima para a contagem (o que o client já tem em mãos). */
export type RedemptionForLimit = {
  reward_id: string
  status: string
  created_at: string
}

/**
 * Quantos resgates do dependente **ocupam** o limite daquela recompensa desde
 * `sinceIso` (a fronteira da janela, calculada no servidor).
 *
 * `sinceIso` ausente = contagem sem janela (usado pelo servidor quando a
 * fronteira ainda não é conhecida).
 */
export function countRewardRedemptionsSince(
  redemptions: RedemptionForLimit[],
  rewardId: string,
  sinceIso?: string
): number {
  const since = sinceIso ? new Date(sinceIso).getTime() : null
  return redemptions.filter((redemption) => {
    if (redemption.reward_id !== rewardId) return false
    if (
      !(REWARD_LIMIT_COUNTED_STATUSES as readonly string[]).includes(
        redemption.status
      )
    ) {
      return false
    }
    if (since === null) return true
    return new Date(redemption.created_at).getTime() >= since
  }).length
}

/**
 * O limite (diário ou mensal) foi atingido? `limit` 0 (ou ausente) =
 * ilimitado → nunca.
 */
export function isRewardLimitReached(
  used: number,
  limit: number | undefined | null
): boolean {
  if (isRewardUnlimited(limit)) return false
  return used >= (limit as number)
}

/**
 * CASTIGO DO DEPENDENTE — módulo PURO (sem `'use server'`, sem Supabase).
 *
 * O castigo é apenas um **indicador** que o ADMIN escreve para o dependente
 * (ícone de triângulo no cabeçalho, ver ADR-0020): não mexe em pontos, tarefas,
 * recompensas, conquistas nem saldo. As regras de preenchimento, expiração e
 * rótulo vivem aqui para que a action (servidor), a leitura e as UIs (admin e
 * dependente) compartilhem exatamente a mesma definição.
 */

export const PUNISHMENT_MAX_DESCRIPTION = 500
export const PUNISHMENT_MIN_DURATION_DAYS = 1
export const PUNISHMENT_MAX_DURATION_DAYS = 365

/** Castigo como atravessa a fronteira servidor → client (serializável). */
export type ActivePunishment = {
  id: string
  description: string | null
  durationDays: number | null
  /** Instante de expiração (ISO) ou `null` = sem duração. */
  expiresAt: string | null
  createdAt: string
}

/** Entrada do formulário do ADMIN (ambos os campos opcionais). */
export type PunishmentInput = {
  description?: string | null
  durationDays?: number | null
}

/**
 * Linhas cruas de `dependent_punishments` — o suficiente para decidir se o
 * castigo ainda vale (`isPunishmentActive`).
 */
export type PunishmentRow = {
  expires_at: string | null
}

/**
 * Validação fail-closed dos campos do castigo (usada na Server Action).
 * Devolve `null` quando está válido, ou a mensagem de erro.
 *
 * Regra: **os dois campos são opcionais**, mas se houver conteúdo precisam ser
 * válidos — descrição de 1 a 500 caracteres (com `.trim()`) e duração inteira
 * de 1 a 365 dias.
 */
export function validatePunishmentFields(input: PunishmentInput): string | null {
  const description = input.description?.trim() ?? ''

  if (description.length > PUNISHMENT_MAX_DESCRIPTION) {
    return `A descrição deve ter no máximo ${PUNISHMENT_MAX_DESCRIPTION} caracteres.`
  }

  const { durationDays } = input

  if (durationDays !== null && durationDays !== undefined) {
    if (!Number.isInteger(durationDays)) {
      return 'A duração deve ser um número inteiro de dias.'
    }
    if (
      durationDays < PUNISHMENT_MIN_DURATION_DAYS ||
      durationDays > PUNISHMENT_MAX_DURATION_DAYS
    ) {
      return `A duração deve ser entre ${PUNISHMENT_MIN_DURATION_DAYS} e ${PUNISHMENT_MAX_DURATION_DAYS} dias.`
    }
  }

  return null
}

/**
 * O castigo ainda vale? Sem duração (`expires_at` null) vale até o ADMIN remover;
 * com duração, vale enquanto o instante de expiração for posterior a `now`.
 * Expiração é avaliada **na leitura** (server-side) — não há cron no projeto.
 */
export function isPunishmentActive(
  punishment: PunishmentRow,
  now: Date = new Date()
): boolean {
  if (!punishment.expires_at) return true
  const expires = new Date(punishment.expires_at)
  if (Number.isNaN(expires.getTime())) return false
  return expires.getTime() > now.getTime()
}

/**
 * Instante de expiração a gravar para a duração escolhida, ou `null` quando o
 * ADMIN não definiu duração (castigo sem prazo). O cálculo é feito no servidor
 * (`now` do servidor = fuso da aplicação, sem ambiguidade de `datetime-local`).
 */
export function punishmentExpiryFromNow(
  durationDays: number | null,
  now: Date = new Date()
): string | null {
  if (durationDays === null || durationDays === undefined) return null
  const expires = new Date(now.getTime())
  expires.setDate(expires.getDate() + durationDays)
  return expires.toISOString()
}

/** Rótulo da duração para exibição ("3 dias", "1 dia", "sem duração"). */
export function punishmentDurationLabel(durationDays: number | null): string {
  if (durationDays === null || durationDays === undefined) {
    return 'Sem duração definida'
  }
  return durationDays === 1 ? '1 dia' : `${durationDays} dias`
}
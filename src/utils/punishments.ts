/**
 * CASTIGO DO DEPENDENTE — módulo PURO (sem `'use server'`, sem Supabase).
 *
 * O castigo é apenas um **indicador** que o ADMIN escreve para o dependente
 * (ícone de triângulo no cabeçalho, ver ADR-0020): não mexe em pontos, tarefas,
 * recompensas, conquistas nem saldo. As regras de preenchimento, expiração e
 * rótulo vivem aqui para que a action (servidor), a leitura e as UIs (admin e
 * dependente) compartilhem exatamente a mesma definição.
 *
 * São **dois níveis**, escolhidos pelo ADMIN na aplicação:
 * - **1 — Aviso**: só um alerta de que o castigo está próximo. O dependente vê o
 *   triângulo **amarelo**; nada além disso acontece.
 * - **2 — Castigo**: o castigo vigente. O dependente vê o triângulo
 *   **vermelho**.
 *
 * A diferença entre os dois é **a cor e o texto** — os dois continuam sendo só
 * indicador (ADR-0020). O nível 2 é o comportamento que já existia, então é o
 * padrão quando o ADMIN não escolhe explicitamente (e o que as linhas já
 * gravadas passam a valer).
 */

export const PUNISHMENT_MAX_DESCRIPTION = 500
export const PUNISHMENT_MIN_DURATION_DAYS = 1
export const PUNISHMENT_MAX_DURATION_DAYS = 365

/** Nível 1: aviso de que o castigo está próximo (ícone amarelo). */
export const PUNISHMENT_LEVEL_WARNING = 1
/** Nível 2: castigo vigente (ícone vermelho) — o comportamento anterior. */
export const PUNISHMENT_LEVEL_PUNISHED = 2

export type PunishmentLevel = typeof PUNISHMENT_LEVEL_WARNING | typeof PUNISHMENT_LEVEL_PUNISHED

/** Ordem de exibição no seletor do ADMIN (do aviso ao castigo). */
export const PUNISHMENT_LEVELS: PunishmentLevel[] = [
  PUNISHMENT_LEVEL_WARNING,
  PUNISHMENT_LEVEL_PUNISHED,
]

export function isValidPunishmentLevel(value: unknown): value is PunishmentLevel {
  return value === PUNISHMENT_LEVEL_WARNING || value === PUNISHMENT_LEVEL_PUNISHED
}

/**
 * Normaliza o nível vindo do banco. Valor inesperado (só possível se a coluna
 * perder o CHECK) cai no **castigo** — é o estado mais "barulhento" na tela do
 * dependente, então é o lado seguro de errar.
 */
export function normalizePunishmentLevel(value: unknown): PunishmentLevel {
  return isValidPunishmentLevel(value) ? value : PUNISHMENT_LEVEL_PUNISHED
}

/** Rótulo curto do nível ("Aviso" / "Castigo"). */
export function punishmentLevelLabel(level: PunishmentLevel): string {
  return level === PUNISHMENT_LEVEL_WARNING ? 'Aviso' : 'Castigo'
}

/** Explicação de uma linha no seletor do ADMIN. */
export function punishmentLevelHint(level: PunishmentLevel): string {
  return level === PUNISHMENT_LEVEL_WARNING
    ? 'Só um alerta: o triângulo fica amarelo, avisando que o castigo está próximo.'
    : 'Castigo vigente: o triângulo fica vermelho no cabeçalho do dependente.'
}

/** Castigo como atravessa a fronteira servidor → client (serializável). */
export type ActivePunishment = {
  id: string
  level: PunishmentLevel
  description: string | null
  durationDays: number | null
  /** Instante de expiração (ISO) ou `null` = sem duração. */
  expiresAt: string | null
  createdAt: string
}

/** Entrada do formulário do ADMIN (o nível é obrigatório no caminho do cliente). */
export type PunishmentInput = {
  level?: PunishmentLevel | null
  description?: string | null
  durationDays?: number | null
}

/**
 * Castigo ativo de um dependente da casa, **com o `profileId`** — é o que a tela
 * de gestão do ADMIN recebe para marcar a linha e abrir o castigo atual no modal
 * (ver `HousesManager`).
 */
export type HouseActivePunishment = ActivePunishment & {
  profileId: string
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
 * Regra: **descrição e duração são opcionais**, mas se houver conteúdo precisam
 * ser válidos — descrição de 1 a 500 caracteres (com `.trim()`) e duração
 * inteira de 1 a 365 dias.
 *
 * O **nível** é obrigatório quando informado: só `1` (aviso) ou `2` (castigo).
 * Ausente (`undefined`) cai no 2 — é o comportamento anterior, então uma action
 * que não sabe do nível continua aplicando o castigo de sempre.
 */
export function validatePunishmentFields(input: PunishmentInput): string | null {
  if (input.level !== undefined && input.level !== null) {
    if (!isValidPunishmentLevel(input.level)) {
      return 'Nível de aviso inválido.'
    }
  }

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
/**
 * Limite de caracteres das descrições (tarefa, recompensa, conquista).
 *
 * Módulo puro e genérico — sem React, sem Supabase — porque é usado pelo
 * servidor (validação fail-closed nas actions) e pela UI (contador e
 * `maxLength`). A casa escolhe os números em `/dashboard/admin/settings`
 * (chave `text_limits`); `0` = sem limite, na mesma convenção de `task_rules`.
 */

/** Menor valor aceito nas settings (0 = sem limite). */
export const TEXT_LIMIT_MIN = 0
/** Maior valor aceito nas settings — teto de digitação, não de banco. */
export const TEXT_LIMIT_MAX = 2000

/**
 * Conta "caracteres" como o usuário conta: **code points**, não unidades UTF-16.
 *
 * `String.length` diria que um emoji vale 2 e um caractere fora do BMP (s.milagre:
 * 👨‍👩‍👧, 𝔄) também — então uma descrição com 300 emojis estouraria um limite de
 * 500 sem nenhum deles estar "cheio". Como o limite é uma restrição de
 * digitação, o que o usuário enxerga é o número de caracteres, então é isso que
 * a regra mede.
 */
export function countTextChars(text: string): number {
  return [...text].length
}

/** O texto estourou o limite? `limit <= 0` = sem limite (nunca estoura). */
export function exceedsTextLimit(text: string, limit: number): boolean {
  if (limit <= 0) return false
  return countTextChars(text) > limit
}

/** Rótulo do limite para a UI: "500 caracteres" ou "sem limite". */
export function textLimitLabel(limit: number): string {
  return limit > 0 ? `${limit} caracteres` : 'sem limite'
}

/**
 * Validação fail-closed das 6 chamadas (criar/editar × 3 domínios).
 *
 * Devolve a mensagem de erro, ou `null` quando está dentro do limite. `label` é
 * o sujeito na frase ("da tarefa", "da recompensa", "da conquista") e entra
 * pronto na mensagem — assim os 3 domínios não divergem no texto do erro.
 *
 * Conta o texto já **aparado**, porque é o que vai para o banco (as actions
 * guardam `null` quando sobra string vazia).
 */
export function checkTextLimit(
  label: string,
  text: string | null | undefined,
  limit: number
): string | null {
  if (limit <= 0) return null
  const trimmed = (text ?? '').trim()
  const length = countTextChars(trimmed)
  if (length <= limit) return null
  return `A descrição ${label} deve ter no máximo ${limit} caracteres (está com ${length}).`
}
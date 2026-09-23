export type ActionResult<T = undefined> =
  | { ok: true; message?: string; redirectTo?: string; data?: T }
  | { ok: false; error: string; code?: 'DUPLICATE_TASK'; taskId?: string }

export const USERNAME_PATTERN = /^[a-z0-9._-]{3,24}$/

export function validateUsername(username: string): string | null {
  if (!USERNAME_PATTERN.test(username)) {
    return 'Nome de usuário inválido: use de 3 a 24 caracteres (letras minúsculas, números, ponto, hífen ou sublinhado), sem espaços.'
  }
  return null
}

export function validatePassword(password: string): string | null {
  if (password.length < 6) {
    return 'A senha deve ter pelo menos 6 caracteres.'
  }
  return null
}

export const POINTS_MIN = -1000000
export const POINTS_MAX = 1000000

export function validatePoints(points: number): string | null {
  if (!Number.isInteger(points)) {
    return 'Informe um valor inteiro de pontos.'
  }
  if (points < POINTS_MIN || points > POINTS_MAX) {
    return `Os pontos devem ficar entre ${POINTS_MIN} e ${POINTS_MAX}.`
  }
  return null
}
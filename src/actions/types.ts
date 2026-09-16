export type ActionResult =
  | { ok: true; message?: string; redirectTo?: string }
  | { ok: false; error: string }

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
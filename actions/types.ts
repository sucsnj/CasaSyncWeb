export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string }

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateCredentials(
  email: string,
  password: string
): string | null {
  if (!EMAIL_PATTERN.test(email)) {
    return 'Informe um e-mail válido.'
  }
  if (password.length < 6) {
    return 'A senha deve ter pelo menos 6 caracteres.'
  }
  return null
}
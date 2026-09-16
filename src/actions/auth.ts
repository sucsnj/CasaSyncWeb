'use server'

import type { ActionResult } from './types'
import { validatePassword, validateUsername } from './types'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

const ADMIN_EMAIL_DOMAIN = 'admin.casasync'
const DEPENDENT_EMAIL_DOMAIN = 'dependente.casasync'

/** Cliente service-role (server-only). Retorna `null` em vez de lançar exceção
 *  quando a config de servidor está ausente — ações NÃO podem lançar, senão o
 *  Next surface overlay de erro de dev com os argumentos da requisição. */
function getAdminClient(): ReturnType<typeof createAdminClient> | null {
  try {
    return createAdminClient()
  } catch {
    return null
  }
}

/**
 * Cadastro de ADMIN. Fluxo simplificado por PIN do sistema + username:
 *   1. Valida `masterPin === process.env.MASTER_PIN` (falha fechada quando
 *      a env não está configurada).
 *   2. Verifica se o username já existe em `profiles` (via service role).
 *   3. Monta o e-mail sintético `${username}@admin.casasync` e cria o usuário
 *      autenticado já 100% confirmado (`email_confirm: true`) — sem e-mails
 *      de confirmação.
 *   4. Grava o perfil em `public.profiles`. Falha no perfil → rollback
 *      (`deleteUser`) para não deixar usuários órfãos.
 */
export async function registerAdmin(
  fullName: string,
  username: string,
  password: string,
  masterPin: string
): Promise<ActionResult> {
  const name = fullName.trim()
  const normalizedUsername = username.trim().toLowerCase()

  if (!name) {
    return { ok: false, error: 'Informe o nome completo.' }
  }

  const usernameError = validateUsername(normalizedUsername)
  if (usernameError) {
    return { ok: false, error: usernameError }
  }

  const passwordError = validatePassword(password)
  if (passwordError) {
    return { ok: false, error: passwordError }
  }

  if (masterPin !== process.env.MASTER_PIN) {
    return { ok: false, error: 'PIN do sistema inválido' }
  }

  const admin = getAdminClient()
  if (!admin) {
    return { ok: false, error: 'Configuração do servidor indisponível.' }
  }

  // Username único em `profiles` (colunas com índice único no banco).
  const { data: existing } = await admin
    .from('profiles')
    .select('id')
    .eq('username', normalizedUsername)
    .maybeSingle()

  if (existing) {
    return { ok: false, error: 'Este nome de usuário já está em uso.' }
  }

  const email = `${normalizedUsername}@${ADMIN_EMAIL_DOMAIN}`

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: name,
      username: normalizedUsername,
      user_role: 'ADMIN',
    },
  })

  if (error || !data.user) {
    return { ok: false, error: error?.message ?? 'Falha ao criar a conta.' }
  }

  const { error: profileError } = await admin.from('profiles').upsert(
    {
      id: data.user.id,
      full_name: name,
      username: normalizedUsername,
      user_role: 'ADMIN',
    },
    { onConflict: 'id' }
  )

  if (profileError) {
    // Remove a conta recém-criada para evitar órfãos caso o perfil falhe.
    await admin.auth.admin.deleteUser(data.user.id)
    return { ok: false, error: 'Falha ao criar o perfil do administrador.' }
  }

  return { ok: true, message: 'Conta de administrador criada.' }
}

/**
 * Login por username + senha. O username mapeia para o e-mail sintético e o
 * domínio depende da role da conta (ADMIN → `@admin.casasync`, DEPENDENT →
 * `@dependente.casasync`). Como payload de e-mail e senha devem chegar juntos,
 * primeiro resolvemos o domínio na tabela `profiles` (via service role — o
 * usuário ainda não está autenticado) e então chamamos `signInWithPassword`
 * com o cliente do servidor, que grava as cookies de sessão na própria action.
 * Erros de "não encontrado" e "senha inválida" retornam a mesma mensagem para
 * não revelar quais usernames existem.
 */
export async function login(
  username: string,
  password: string
): Promise<ActionResult> {
  const normalizedUsername = username.trim().toLowerCase()

  if (!normalizedUsername || !password) {
    return { ok: false, error: 'Informe nome de usuário e senha.' }
  }

  const admin = getAdminClient()
  if (!admin) {
    return { ok: false, error: 'Configuração do servidor indisponível.' }
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('user_role')
    .eq('username', normalizedUsername)
    .maybeSingle()

  if (!profile) {
    return { ok: false, error: 'Credenciais inválidas.' }
  }

  const email = `${normalizedUsername}@${
    profile.user_role === 'ADMIN' ? ADMIN_EMAIL_DOMAIN : DEPENDENT_EMAIL_DOMAIN
  }`

  const supabase = await createClient()

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error || !data.user) {
    return { ok: false, error: 'Credenciais inválidas.' }
  }

  return {
    ok: true,
    redirectTo:
      profile.user_role === 'ADMIN'
        ? '/dashboard/admin'
        : '/dashboard/dependent',
  }
}
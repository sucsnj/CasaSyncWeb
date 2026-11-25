'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { login } from '@/actions/auth'
import { restoreSessionFromRefreshToken } from '@/actions/biometric'
import { RegisterForm } from '@/components/auth/register-form'
import { getRecentAccounts, removeRecentAccount, saveRecentAccount } from '@/utils/recent-accounts'
import { biometricVault } from '@/utils/biometric-vault'
import { Preferences } from '@capacitor/preferences'
import { createClient } from '@/utils/supabase/client'
import type { RecentAccount } from '@/utils/biometric-vault'
import { Button } from '@/components/ui/button'
import { ClearableInput } from '@/components/ui/clearable-input'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export function LoginForm({
  redirectedFrom,
  error,
}: {
  redirectedFrom?: string
  error?: string
}) {
  const router = useRouter()

  const [formError, setFormError] = useState<string | null>(
    error === 'auth_callback' ? 'Falha ao autenticar. Tente novamente.' : null
  )
  const [pending, startTransition] = useTransition()
  const [recentAccounts, setRecentAccounts] = useState<RecentAccount[]>([])
  const usernameRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void getRecentAccounts().then(setRecentAccounts)
  }, [])

  async function handleRecentAccount(account: RecentAccount) {
    setFormError(null)
    if (account.biometricEnabled) {
      const token = await biometricVault.verifyAndGetToken(account.userId)
      if (token) {
        startTransition(async () => {
          const result = await restoreSessionFromRefreshToken(token)
          if (!result.ok) {
            setFormError(result.error)
            // Atualiza o cofre com o token rotacionado, se disponível.
            return
          }
          if (result.data?.refreshToken) {
            await biometricVault.saveToken(account.userId, result.data.refreshToken)
          }
          router.push(result.data?.redirectTo ?? '/')
          router.refresh()
        })
        return
      }
    }
    // Sem biometria (ou falhou): preenche o apelido/e-mail e foca a senha.
    if (usernameRef.current) {
      usernameRef.current.value = account.loginIdentifier
    }
    passwordRef.current?.focus()
  }

  async function handleRemoveAccount(account: RecentAccount) {
    await biometricVault.deleteToken(account.userId)
    await removeRecentAccount(account.userId)
    setRecentAccounts((prev) => prev.filter((a) => a.userId !== account.userId))
  }

  function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)

    // Segurança: a senha fica só na DOM (input uncontrolled) e é lida do
    // FormData no momento do submit. NUNCA entra em estado React, então não
    // aparece em DevTools/console do lado do cliente.
    const formData = new FormData(event.currentTarget)
    const username = String(formData.get('username') ?? '').trim()
    const password = String(formData.get('password') ?? '')

    startTransition(async () => {
      try {
        // Login server-side: autentica PRIMEIRO (via e-mail sintético) e só
        // depois resolve a role em `profiles` para redirecionar.
        const result = await login(username, password)

        if (!result.ok) {
          setFormError(result.error)
          return
        }

        // Salva o perfil recente (metadados não-sensíveis) em background, sem
        // bloquear a navegação (evita o botão preso em "Entrando...").
        if (result.data) {
          const accountData = result.data
          void (async () => {
            try {
              await saveRecentAccount({
                userId: accountData.userId,
                loginIdentifier: accountData.loginIdentifier,
                displayName: accountData.displayName,
                avatarUrl: accountData.avatarUrl,
                role: accountData.role,
                biometricEnabled: false,
              })
              setRecentAccounts(await getRecentAccounts())

              // Tenta ativar a biometria sem depender de isAvailable() (que pode
              // retornar false em alguns aparelhos mesmo com digital cadastrada).
              try {
                const supabase = createClient()
                const { data: sessionData } = await supabase.auth.getSession()
                const refreshToken = sessionData.session?.refresh_token
                if (refreshToken) {
                  await biometricVault.saveToken(accountData.userId, refreshToken)
                  const list = await getRecentAccounts()
                  const updated = list.map((a) =>
                    a.userId === accountData.userId ? { ...a, biometricEnabled: true } : a
                  )
                  await Preferences.set({
                    key: 'casasync:recent-accounts',
                    value: JSON.stringify(updated),
                  })
                  setRecentAccounts(updated)
                }
              } catch {
                // biometria é opcional
              }
            } catch {
              // ignore
            }
          })()
        }

        router.push(result.redirectTo ?? '/')
        router.refresh()
      } catch {
        setFormError('Falha de conexão. Tente novamente.')
      }
    })
  }

  return (
    <div className="w-full max-w-sm">
      <Tabs defaultValue="login">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="login">Entrar</TabsTrigger>
          <TabsTrigger value="register">Criar Conta Admin</TabsTrigger>
        </TabsList>

        <TabsContent value="login" className="mt-4">
          <Card className="w-full">
            <CardHeader>
              <CardTitle className="text-lg">CasaSync</CardTitle>
              <CardDescription>
                Acesse sua conta para continuar.
              </CardDescription>
            </CardHeader>

            <CardContent>
              {recentAccounts.length > 0 ? (
                <div className="mb-4 flex flex-col gap-2">
                  <p className="text-xs font-medium text-slate-500">
                    Contas recentes neste aparelho
                  </p>
                  <div className="flex flex-col gap-2">
                    {recentAccounts.map((account) => (
                      <div
                        key={account.userId}
                        className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                      >
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          onClick={() => void handleRecentAccount(account)}
                        >
                          <span className="flex size-8 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
                            {(account.displayName ?? account.loginIdentifier)
                              .slice(0, 2)
                              .toUpperCase()}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                            {account.displayName ?? account.loginIdentifier}
                          </span>
                          {account.biometricEnabled ? (
                            <span className="text-xs text-emerald-600">
                              Biometria
                            </span>
                          ) : null}
                        </button>
                        <button
                          type="button"
                          aria-label="Remover conta"
                          className="text-xs text-slate-400 hover:text-red-600"
                          onClick={() => void handleRemoveAccount(account)}
                        >
                          Remover
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {redirectedFrom ? (
                <p className="mb-4 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                  Faça login para acessar a página do gestor.
                </p>
              ) : null}

              <form onSubmit={handleLogin} className="flex flex-col gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="username">Nome de usuário</Label>
                  <ClearableInput
                    id="username"
                    name="username"
                    type="text"
                    autoComplete="username"
                    placeholder="Seu nome de usuário"
                    required
                    defaultValue=""
                    ref={usernameRef}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="password">Senha</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    suppressHydrationWarning
                    required
                    ref={passwordRef}
                  />
                </div>

                {formError ? (
                  <p
                    className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
                    role="alert"
                  >
                    {formError}
                  </p>
                ) : null}

                <Button type="submit" disabled={pending} className="w-full">
                  {pending ? 'Entrando...' : 'Entrar'}
                </Button>
              </form>
            </CardContent>

            <CardFooter>
              <p className="text-xs text-muted-foreground">
                Dependentes não se cadastram: o acesso é criado pelo
                administrador da casa.
              </p>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="register" className="mt-4">
          <RegisterForm />
        </TabsContent>
      </Tabs>
    </div>
  )
}
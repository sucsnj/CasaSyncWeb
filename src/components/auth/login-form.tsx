'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { login } from '@/actions/auth'
import { RegisterForm } from '@/components/auth/register-form'
import { Button } from '@/components/ui/button'
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
              {redirectedFrom ? (
                <p className="mb-4 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                  Faça login para acessar a página do gestor.
                </p>
              ) : null}

              <form onSubmit={handleLogin} className="flex flex-col gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="username">Nome de usuário</Label>
                  <Input
                    id="username"
                    name="username"
                    type="text"
                    autoComplete="username"
                    placeholder="Seu nome de usuário"
                    required
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
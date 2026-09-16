'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
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

type CredentialFormProps = {
  idPrefix: string
  email: string
  password: string
  error: string | null
  pending: boolean
  onEmailChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
}

function CredentialForm({
  idPrefix,
  email,
  password,
  error,
  pending,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: CredentialFormProps) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-email`}>E-mail</Label>
        <Input
          id={`${idPrefix}-email`}
          name="email"
          type="email"
          autoComplete="email"
          placeholder="voce@exemplo.com"
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
          required
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-password`}>Senha</Label>
        <Input
          id={`${idPrefix}-password`}
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(event) => onPasswordChange(event.target.value)}
          required
        />
      </div>

      {error ? (
        <p
          className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Entrando...' : 'Entrar'}
      </Button>
    </form>
  )
}

export function LoginForm({
  redirectedFrom,
  error,
}: {
  redirectedFrom?: string
  error?: string
}) {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [formError, setFormError] = useState<string | null>(
    error === 'auth_callback' ? 'Falha ao autenticar. Tente novamente.' : null
  )
  const [pending, startTransition] = useTransition()

  function handleEmailLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)

    startTransition(async () => {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        setFormError(error.message)
        return
      }

      // `/` é protegido: o proxy.ts redireciona para o dashboard da role.
      router.push('/')
      router.refresh()
    })
  }

  function handleGoogleLogin() {
    setFormError(null)

    startTransition(async () => {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (error) {
        setFormError(error.message)
      }
    })
  }

  const formProps: Omit<CredentialFormProps, 'idPrefix' | 'error'> = {
    email,
    password,
    pending,
    onEmailChange: setEmail,
    onPasswordChange: setPassword,
    onSubmit: handleEmailLogin,
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-lg">CasaSync</CardTitle>
        <CardDescription>Acesse sua conta para continuar.</CardDescription>
      </CardHeader>

      <CardContent>
        {redirectedFrom ? (
          <p className="mb-4 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            Faça login para acessar a página do gestor.
          </p>
        ) : null}

        <Tabs defaultValue="admin">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="admin">Administrador</TabsTrigger>
            <TabsTrigger value="dependent">Dependente</TabsTrigger>
          </TabsList>

          <TabsContent value="admin" className="mt-4">
            <div className="flex flex-col gap-4">
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={handleGoogleLogin}
                className="w-full"
              >
                Continuar com Google
              </Button>

              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">ou</span>
                <span className="h-px flex-1 bg-border" />
              </div>

              <CredentialForm idPrefix="admin" error={formError} {...formProps} />
            </div>
          </TabsContent>

          <TabsContent value="dependent" className="mt-4">
            <CredentialForm idPrefix="dependent" error={null} {...formProps} />
          </TabsContent>
        </Tabs>
      </CardContent>

      <CardFooter className="flex-col items-start gap-1">
        <p className="text-sm text-muted-foreground">
          É administrador e ainda não tem conta?{' '}
          <Link
            href="/register"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Cadastre-se
          </Link>
        </p>
        <p className="text-xs text-muted-foreground">
          Dependentes não se cadastram: o acesso é criado pelo administrador da casa.
        </p>
      </CardFooter>
    </Card>
  )
}
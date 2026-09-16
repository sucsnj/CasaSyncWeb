'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { registerAdmin } from '@/actions/auth'
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

export function RegisterForm() {
  const router = useRouter()

  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [masterPin, setMasterPin] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)

    startTransition(async () => {
      const result = await registerAdmin(
        fullName,
        username,
        password,
        masterPin
      )

      if (!result.ok) {
        setFormError(result.error)
        return
      }

      // Conta criada e confirmada: volta para a aba de login entrar.
      router.push('/login')
      router.refresh()
    })
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-lg">Criar conta de Administrador</CardTitle>
        <CardDescription>
          Cadastre-se para criar e gerenciar casas e dependentes.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="full-name">Nome completo</Label>
            <Input
              id="full-name"
              name="fullName"
              type="text"
              autoComplete="name"
              placeholder="Seu nome"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="username">Nome de usuário</Label>
            <Input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              placeholder="ex.: joao_silva (3-24 caracteres)"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder="Mínimo de 6 caracteres"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              suppressHydrationWarning
              required
              minLength={6}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="master-pin">PIN do sistema</Label>
            <Input
              id="master-pin"
              name="masterPin"
              type="password"
              autoComplete="off"
              placeholder="PIN fornecido pelo administrador geral"
              value={masterPin}
              onChange={(event) => setMasterPin(event.target.value)}
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
            {pending ? 'Criando conta...' : 'Criar conta'}
          </Button>
        </form>
      </CardContent>

      <CardFooter>
        <p className="text-sm text-muted-foreground">
          Já tem conta?{' '}
          <Link
            href="/login"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Entrar
          </Link>
        </p>
      </CardFooter>
    </Card>
  )
}
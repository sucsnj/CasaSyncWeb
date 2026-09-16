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

  const [formError, setFormError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    // currentTarget é nulled após o primeiro await — capturar a referência do
    // form agora para poder chamar reset() depois do registerAdmin.
    const form = event.currentTarget

    setFormError(null)

    // Segurança: senha/PIN ficam apenas na DOM (inputs uncontrolled) e são
    // lidos do FormData só no momento do submit. NUNCA entram em estado React
    // (não ficam visíveis em DevTools/estado do componente).
    const formData = new FormData(form)
    const fullName = String(formData.get('fullName') ?? '').trim()
    const username = String(formData.get('username') ?? '').trim()
    const password = String(formData.get('password') ?? '')
    const masterPin = String(formData.get('masterPin') ?? '')

    startTransition(async () => {
      const result = await registerAdmin(fullName, username, password, masterPin)

      if (!result.ok) {
        setFormError(result.error)
        return
      }

      // Conta criada e confirmada: limpa o formulário e volta ao login.
      form.reset()
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
              minLength={3}
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
              suppressHydrationWarning
              minLength={6}
              required
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
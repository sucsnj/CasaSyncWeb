import type { Metadata } from 'next'
import { LoginForm } from '@/components/auth/login-form'

export const metadata: Metadata = {
  title: 'Entrar | CasaSync',
}

type LoginSearchParams = {
  redirectedFrom?: string
  error?: string
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<LoginSearchParams>
}) {
  const params = await searchParams

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <LoginForm redirectedFrom={params.redirectedFrom} error={params.error} />
    </main>
  )
}
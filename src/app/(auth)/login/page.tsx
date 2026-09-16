import type { Metadata } from 'next'
import { House } from 'lucide-react'
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
    <main className="flex min-h-svh flex-col items-center justify-center gap-8 bg-slate-100 p-4 py-10">
      <div className="flex flex-col items-center gap-3">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-md">
          <House className="size-7" />
        </span>
        <div className="text-center">
          <p className="text-2xl font-bold tracking-tight text-slate-800">
            CasaSync
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Seu lar, suas tarefas e recompensas.
          </p>
        </div>
      </div>

      <LoginForm redirectedFrom={params.redirectedFrom} error={params.error} />
    </main>
  )
}
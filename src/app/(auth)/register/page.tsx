import type { Metadata } from 'next'
import { House } from 'lucide-react'
import { RegisterForm } from '@/components/auth/register-form'

export const metadata: Metadata = {
  title: 'Cadastro de Administrador | CasaSync',
}

export default function RegisterPage() {
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
            Crie a conta de administrador da sua casa.
          </p>
        </div>
      </div>

      <RegisterForm />
    </main>
  )
}
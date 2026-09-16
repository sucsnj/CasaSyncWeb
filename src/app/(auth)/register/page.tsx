import type { Metadata } from 'next'
import { RegisterForm } from '@/components/auth/register-form'

export const metadata: Metadata = {
  title: 'Cadastro de Administrador | CasaSync',
}

export default function RegisterPage() {
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <RegisterForm />
    </main>
  )
}
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function Home() {
  // Protegida pelo proxy.ts: autenticados vão para o dashboard da role.
  redirect('/login')
}
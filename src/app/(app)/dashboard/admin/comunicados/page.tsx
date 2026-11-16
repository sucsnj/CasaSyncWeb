import type { Metadata } from 'next'
import { ComunicadosAdmin } from '@/components/comunicados/comunicados-admin'

export const metadata: Metadata = {
  title: 'Comunicados',
}

export default function AdminComunicadosPage() {
  return (
    <main className="flex flex-col gap-6">
      <ComunicadosAdmin />
    </main>
  )
}

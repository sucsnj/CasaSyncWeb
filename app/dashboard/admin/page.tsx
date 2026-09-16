import type { Metadata } from 'next'
import Link from 'next/link'
import { getActiveAdminHouse } from '@/utils/house'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export const metadata: Metadata = {
  title: 'Visão geral | CasaSync',
}

export const dynamic = 'force-dynamic'

export default async function AdminDashboardPage() {
  const activeHouse = await getActiveAdminHouse()

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-medium">Visão geral</h1>
        <p className="text-sm text-muted-foreground">
          {activeHouse
            ? `Casa ativa: ${activeHouse.name}`
            : 'Nenhuma casa ativa ainda — crie a primeira.'}
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/dashboard/admin/houses">
          <Card className="transition-colors hover:border-primary">
            <CardHeader>
              <CardTitle>Casas</CardTitle>
              <CardDescription>Criar, alternar e ver membros.</CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/tasks">
          <Card className="transition-colors hover:border-primary">
            <CardHeader>
              <CardTitle>Tarefas</CardTitle>
              <CardDescription>Criar, editar e aprovar tarefas.</CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/rewards">
          <Card className="transition-colors hover:border-primary">
            <CardHeader>
              <CardTitle>Recompensas</CardTitle>
              <CardDescription>Loja e aprovação de resgates.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>
    </div>
  )
}
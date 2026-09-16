import type { Metadata } from 'next'
import Link from 'next/link'
import { getDependentHouse, getSessionProfile } from '@/utils/house'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export const metadata: Metadata = {
  title: 'Visão geral | CasaSync',
}

export const dynamic = 'force-dynamic'

export default async function DependentDashboardPage() {
  const { user, profile } = await getSessionProfile()
  const house = user ? await getDependentHouse(user.id) : null

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-medium">Visão geral</h1>
        <p className="text-sm text-muted-foreground">
          {house ? `Casa: ${house.name}` : 'Você ainda não foi vinculado a uma casa.'}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Seu saldo</CardTitle>
          <CardDescription>
            Pontos acumulados com tarefas aprovadas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="font-heading text-3xl font-semibold">
            {profile?.points ?? 0} pts
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/tasks">
          <Card className="transition-colors hover:border-primary">
            <CardHeader>
              <CardTitle>Tarefas</CardTitle>
              <CardDescription>Veja e conclua suas tarefas.</CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/rewards">
          <Card className="transition-colors hover:border-primary">
            <CardHeader>
              <CardTitle>Recompensas</CardTitle>
              <CardDescription>Troque seus pontos por prêmios.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>
    </div>
  )
}
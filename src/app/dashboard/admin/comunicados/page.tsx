import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/utils/supabase/admin'
import { getActiveAdminHouse, getSessionProfile } from '@/utils/house'
import { ComunicadosAdmin } from '@/components/comunicados/comunicados-admin'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Comunicados',
}

export const dynamic = 'force-dynamic'

export default async function AdminComunicadosPage() {
  const { profile } = await getSessionProfile()
  if (profile?.user_role !== 'ADMIN') {
    redirect('/dashboard/dependent')
  }

  const activeHouse = await getActiveAdminHouse()

  if (!activeHouse) {
    return (
      <div className="mx-auto flex min-h-svh w-full max-w-5xl flex-col gap-6 p-4 pt-20 pb-24 md:p-6 md:pt-24 md:pb-6">
        <Card className="mx-auto max-w-md">
          <CardHeader>
            <CardTitle>Nenhuma casa ativa</CardTitle>
            <CardDescription>
              Selecione uma casa para criar comunicados.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/dashboard/admin/houses"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Gerenciar casas →
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  const admin = createAdminClient()
  const { data: comunicados } = await admin
    .from('comunicados')
    .select('*')
    .eq('house_id', activeHouse.id)
    .order('created_at', { ascending: false })

  const ids = (comunicados ?? []).map((comunicado) => comunicado.id)
  let confirmations: Record<string, number> = {}
  if (ids.length > 0) {
    const { data: deliveries } = await admin
      .from('comunicado_deliveries')
      .select('comunicado_id, delivered_count')
      .in('comunicado_id', ids)
    confirmations = (deliveries ?? []).reduce<Record<string, number>>(
      (acc, delivery) => {
        acc[delivery.comunicado_id] =
          (acc[delivery.comunicado_id] ?? 0) + delivery.delivered_count
        return acc
      },
      {}
    )
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-5xl flex-col gap-6 p-4 pt-20 pb-24 md:p-6 md:pt-24 md:pb-6">
      <ComunicadosAdmin
        houseId={activeHouse.id}
        initialComunicados={comunicados ?? []}
        initialConfirmations={confirmations}
      />
    </div>
  )
}
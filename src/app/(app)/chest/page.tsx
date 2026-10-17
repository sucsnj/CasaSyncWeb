import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/utils/supabase/admin'
import {
  getActiveAdminHouse,
  getAdminHouses,
  getDependentHouse,
  getSessionProfile,
} from '@/utils/house'
import { ChestAdmin } from '@/components/chest/chest-admin'
import { ChestDependent } from '@/components/chest/chest-dependent'
import { getHouseChestRulesSettings } from '@/utils/house-settings'
import type { ChestItemView } from '@/components/chest/chest-types'

export const metadata: Metadata = {
  title: 'Baú',
}

export const dynamic = 'force-dynamic'

/**
 * BAÚ DA CASA (ADR-0024) — rota role-aware no grupo `(app)`, então herda o shell
 * (nav, sino, castigo, fila de comunicados) do layout e o `loading.tsx` cobre só
 * o conteúdo.
 *
 * Leitura por **service-role**, com escopo derivado da sessão (ADR-0006):
 *   - ADMIN: itens de **todas** as casas que ele controla (`house_members.role =
 *     'ADMIN'`, via `getAdminHouses`), não só da casa ativa — é o que permite
 *     criar na casa B e editar o item sem trocar de casa;
 *   - DEPENDENT: itens da **própria** casa (`.eq('house_id', house.id)`).
 *
 * Mais recentes primeiro (`created_at desc`): o acervo só cresce, e o material
 * novo é o que se procura.
 */
export default async function ChestPage() {
  const { user, profile } = await getSessionProfile()

  if (!user || !profile) {
    redirect('/login')
  }

  const admin = createAdminClient()
  const isAdmin = profile.user_role === 'ADMIN'

  let content: React.ReactNode

  if (isAdmin) {
    const houses = await getAdminHouses(user.id)

    if (houses.length === 0) {
      content = (
        <p className="text-sm text-muted-foreground">
          Crie ou selecione uma casa em{' '}
          <a href="/dashboard/admin/houses" className="text-primary underline">
            Casas
          </a>{' '}
          para popular o baú.
        </p>
      )
    } else {
      const [activeHouse, { data: items }] = await Promise.all([
        getActiveAdminHouse(),
        admin
          .from('chest_items')
          .select('*')
          .in(
            'house_id',
            houses.map((house) => house.id)
          )
          .order('created_at', { ascending: false }),
      ])

      // Teto de itens da **casa ativa** — o aviso de proximidade no form. As
      // outras casas do ADMIN têm o próprio limite, que só a action conhece (ela
      // recusa no `create`), então aqui só a ativa é exibida.
      const { maxItems } = await getHouseChestRulesSettings(
        activeHouse?.id ?? houses[0].id
      )

      const nameById = new Map(houses.map((house) => [house.id, house.name]))

      content = (
        <ChestAdmin
          key={user.id}
          initialItems={(items ?? []).map((item) => ({
            ...item,
            houseName: nameById.get(item.house_id) ?? null,
          })) satisfies ChestItemView[]}
          houses={houses.map((house) => ({ id: house.id, name: house.name }))}
          activeHouseId={activeHouse?.id ?? houses[0].id}
          maxItems={maxItems}
        />
      )
    }
  } else {
    const house = await getDependentHouse(user.id)

    if (!house) {
      content = (
        <p className="text-sm text-muted-foreground">
          Você ainda não foi vinculado a uma casa.
        </p>
      )
    } else {
      const { data: items } = await admin
        .from('chest_items')
        .select('*')
        .eq('house_id', house.id)
        .order('created_at', { ascending: false })

      content = (
        <ChestDependent
          key={house.id}
          houseId={house.id}
          initialItems={(items ?? []).map((item) => ({
            ...item,
            houseName: house.name,
          }))}
        />
      )
    }
  }

  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-800">
          Baú
        </h1>
        <p className="text-sm text-slate-500">
          {isAdmin
            ? 'Arquivos que você disponibiliza para os dependentes.'
            : 'Arquivos que seu tutor deixou para você consultar.'}
        </p>
      </header>
      {content}
    </main>
  )
}
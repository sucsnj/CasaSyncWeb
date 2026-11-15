import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import {
  getActiveAdminHouse,
  getDependentHouse,
  getSessionProfile,
} from '@/utils/house'
import { listChest } from '@/actions/chest-reads'
import { ChestAdmin } from '@/components/chest/chest-admin'
import { ChestDependent } from '@/components/chest/chest-dependent'

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
 *   - ADMIN: itens da **casa ativa** (`.eq('house_id', activeHouse.id)`) — o acervo
 *     é da casa, não do ADMIN (emenda "baú por casa"), e o item novo nasce nela;
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

  const isAdmin = profile.user_role === 'ADMIN'

  let content: React.ReactNode

  if (isAdmin) {
    // O baú é **da casa ativa** (emenda "baú por casa" no ADR-0024): o acervo
    // exibido é o dela e o item novo nasce nela, então a tela não precisa — e não
    // quer — a lista de casas que o ADMIN controla.
    const activeHouse = await getActiveAdminHouse()

    if (!activeHouse) {
      content = (
        <p className="text-sm text-muted-foreground">
          Selecione uma casa para abrir o baú dela em{' '}
          <a href="/dashboard/admin/houses" className="text-primary underline">
            Casas
          </a>
          .
        </p>
      )
    } else {
      const bundle = await listChest(activeHouse.id)
      if (bundle.role !== 'ADMIN') throw new Error('ROLE_MISMATCH')
      const initialData = bundle

      content = (
        <ChestAdmin
          key={activeHouse.id}
          houseId={activeHouse.id}
          houseName={activeHouse.name}
          initialData={initialData}
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
      // Anexos do baú em relação à casa (ADR-0026) — o bundle traz os itens
      // e o flag de `chestAllowed` num único payload.
      const bundle = await listChest(house.id)
      if (bundle.role !== 'DEPENDENT') throw new Error('ROLE_MISMATCH')
      const initialData = bundle

      content = (
        <ChestDependent
          key={house.id}
          houseId={house.id}
          initialData={initialData}
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
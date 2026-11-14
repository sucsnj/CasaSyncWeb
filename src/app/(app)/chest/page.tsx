import type { Metadata } from 'next'
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { redirect } from 'next/navigation'
import { fetchChestForCache } from '@/actions/chest'
import { queryKeys } from '@/lib/query-keys'
import { unwrapAction } from '@/lib/unwrap-action'
import { createAdminClient } from '@/utils/supabase/admin'
import {
  getActiveAdminHouse,
  getDependentHouse,
  getSessionProfile,
} from '@/utils/house'
import { ChestAdmin } from '@/components/chest/chest-admin'
import { ChestDependent } from '@/components/chest/chest-dependent'
import {
  getHouseAttachmentBudgetSettings,
  getHouseAttachmentSettings,
} from '@/utils/house-settings'
import { houseAttachmentBytes } from '@/utils/attachment-usage'

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

  const admin = createAdminClient()
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
      // Itens + configuração da casa + **peso** dos anexos da casa, em paralelo;
      // os getters saem do mesmo `getHouseSettingsMap` da casa ativa (2 leituras,
      // não 3). O peso é 1 leitura de storage a mais nesta tela — o número que o
      // form mostra é do arquivo real, não de uma coluna que o app não tem
      // (ADR-0027). Já `/tasks` e `/dashboard/dependent` não pagam nada disso.
      const queryClient = new QueryClient()
      const items = await queryClient.fetchQuery({
        queryKey: queryKeys.chest.items(activeHouse.id),
        queryFn: () => unwrapAction(fetchChestForCache),
      })
      const [attachmentBudget, attachments, usageBytes] = await Promise.all([
        getHouseAttachmentBudgetSettings(activeHouse.id),
        getHouseAttachmentSettings(activeHouse.id),
        houseAttachmentBytes(admin, activeHouse.id).catch(() => 0),
      ])
      const dehydratedState = dehydrate(queryClient)

      content = (
        <HydrationBoundary state={dehydratedState}>
          <ChestAdmin
            key={activeHouse.id}
            initialItems={items}
            houseId={activeHouse.id}
            houseName={activeHouse.name}
            maxMb={attachmentBudget.maxMb}
            usageBytes={usageBytes}
            attachmentsAllowed={attachments.chestAllowed}
          />
        </HydrationBoundary>
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
      // Mesma leitura única do ADMIN (a action resolve o papel).
      const queryClient = new QueryClient()
      const items = await queryClient.fetchQuery({
        queryKey: queryKeys.chest.items(house.id),
        queryFn: () => unwrapAction(fetchChestForCache),
      })

      // A casa desligou os anexos do baú? (ADR-0026) — o item continua listado,
      // mas o arquivo não abre. Sai do mesmo mapa por casa das outras leituras.
      const { chestAllowed } = await getHouseAttachmentSettings(house.id)

      const dehydratedState = dehydrate(queryClient)

      content = (
        <HydrationBoundary state={dehydratedState}>
          <ChestDependent
            key={house.id}
            houseId={house.id}
            attachmentsAllowed={chestAllowed}
            initialItems={items ?? []}
          />
        </HydrationBoundary>
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
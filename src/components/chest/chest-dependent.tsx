'use client'

import { useMemo, useState } from 'react'
import { Package, Search } from 'lucide-react'
import { TaskAttachmentView } from '@/components/tasks/task-attachment-view'
import { CardColumns } from '@/components/ui/card-columns'
import { ClearableInput } from '@/components/ui/clearable-input'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { usePostgresChanges } from '@/hooks/use-postgres-changes'
import type { ChestItemView } from './chest-types'

/**
 * Tela do DEPENDENTE no baú: **só consulta e abertura** — sem edição, sem
 * pontos, sem notificação (ADR-0024).
 *
 * A apresentação do arquivo é a **mesma da tarefa**, reusando o componente:
 * miniatura para imagem, chip para os demais, tudo abrindo em nova aba. A única
 * diferença é `hideFileName`, como no cartão de tarefa do dependente: uma página
 * HTML mostra só o rótulo "Página", não "aula-3.html".
 *
 * A busca é por título, em memória (`useMemo`) — o acervo já está no estado da
 * tela, então uma consulta por tecla só somaria latência. Mesmo critério das
 * buscas de recompensas.
 */
export function ChestDependent({
  initialItems,
  houseId,
}: {
  initialItems: ChestItemView[]
  /** Casa do dependente — é o filtro do Realtime. */
  houseId: string
}) {
  const [items, setItems] = useState(initialItems)
  const [search, setSearch] = useState('')

  // O componente é montado com `key={house.id}`, então a troca de casa já
  // remonta. O que ainda precisa é pegar a prop nova quando ela chega no mesmo
  // mount — um `router.refresh()` posterior a uma escrita (as actions revalidam
  // `/chest`). Ajustar o estado **durante o render** é o padrão do React para
  // "prop mudou": sem efeito, sem cascata de render.
  const [syncedProp, setSyncedProp] = useState(initialItems)
  if (initialItems !== syncedProp) {
    setSyncedProp(initialItems)
    setItems(initialItems)
  }

  // Realtime: o baú é catálogo, então item novo aparece sem F5 (ADR-0024, item
  // 12). Sem notificação — a lista é o canal.
  usePostgresChanges<ChestItemView>({
    table: 'chest_items',
    filter: `house_id=eq.${houseId}`,
    onUpsert: (row) => {
      setItems((current) => {
        const next = current.filter((item) => item.id !== row.id)
        next.push(row)
        return next.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      })
    },
    onDelete: (id) => setItems((current) => current.filter((item) => item.id !== id)),
  })

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return items
    return items.filter((item) => item.title.toLowerCase().includes(term))
  }, [items, search])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-heading text-lg font-semibold text-slate-800">
          <Package className="size-5 text-amber-600" />
          Baú da casa
        </h2>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <ClearableInput
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onClear={() => setSearch('')}
          placeholder="Buscar pelo título..."
          aria-label="Buscar item do baú pelo título"
          className="pl-10"
        />
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={Package}
          accent="bg-amber-100 text-amber-600"
          title="O baú está vazio"
          message="Seu tutor ainda não deixou nenhum arquivo aqui. Quando colocar, ele aparece nesta tela."
        />
      ) : filtered.length === 0 ? (
        <p
          className="rounded-xl bg-slate-100 px-3 py-6 text-center text-sm text-slate-500"
          role="status"
        >
          Nenhum item encontrado para &quot;{search.trim()}&quot;.
        </p>
      ) : (
        <CardColumns className="gap-x-3 sm:columns-2 xl:columns-3 [&>*]:mb-3">
          {filtered.map((item) => (
            <Card key={item.id}>
              <CardContent className="flex flex-col gap-3 py-4">
                <p className="text-base font-bold text-slate-900">{item.title}</p>
                <TaskAttachmentView
                  url={item.file_url}
                  name={item.file_name}
                  type={item.file_type}
                  htmlHref={`/api/chest-item/${item.id}`}
                  hideFileName
                />
              </CardContent>
            </Card>
          ))}
        </CardColumns>
      )}
    </div>
  )
}
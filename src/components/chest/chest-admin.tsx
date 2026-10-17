'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Package, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { createChestItem, deleteChestItem, updateChestItem } from '@/actions/chest'
import { TaskAttachmentInput } from '@/components/tasks/task-attachment-input'
import { TaskAttachmentView } from '@/components/tasks/task-attachment-view'
import { Button } from '@/components/ui/button'
import { CardColumns } from '@/components/ui/card-columns'
import { ClearableInput } from '@/components/ui/clearable-input'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { usePostgresChanges } from '@/hooks/use-postgres-changes'
import { cn } from '@/lib/utils'
import {
  CHEST_ITEM_FOLDER,
  CHEST_ITEM_TITLE_MAX,
  validateChestItemTitle,
} from '@/utils/chest-attachment'
import type { ChestItemView } from './chest-types'

/**
 * Tela do ADMIN no baú (ADR-0024): **acervo por casa**, com título apenas.
 *
 * Forma por cima, lista por baixo — o mesmo desenho de `achievements-admin.tsx`
 * e `rewards-admin.tsx`: o form nasce recolhido atrás de "Novo item" e o
 * "Editar" de um card reusa esse mesmo form (com `scrollIntoView` + foco no
 * título) em vez de um editor dentro de cada card.
 *
 * A lista mostra **todas as casas que o ADMIN controla**, com chip do nome nos
 * itens de outra casa: ele cria e edita onde o item estiver, sem trocar a casa
 * ativa. A casa do item é fixa (ADR-0024, item 5).
 */
export function ChestAdmin({
  initialItems,
  houses,
  activeHouseId,
  maxItems,
}: {
  initialItems: ChestItemView[]
  /** Casas que o ADMIN controla (`house_members.role = 'ADMIN'`). */
  houses: { id: string; name: string }[]
  activeHouseId: string
  /** Teto de itens por casa (`chest_rules`, `0` = sem limite). */
  maxItems: number
}) {
  const [items, setItems] = useState(initialItems)
  const [search, setSearch] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const [houseId, setHouseId] = useState(activeHouseId)
  const [title, setTitle] = useState('')
  const [attachment, setAttachment] = useState<{
    url: string | null
    name: string | null
    type: string | null
  }>({ url: null, name: null, type: null })

  const [confirmDelete, setConfirmDelete] = useState<ChestItemView | null>(null)
  const [deleting, setDeleting] = useState(false)

  const formRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  // Prop do servidor → estado local, pulando enquanto há operação em voo (o
  // mesmo cuidado de `tasks-admin.tsx`: sobrescrever o card que acabou de mudar
  // é pior do que esperar o Realtime).
  //
  // A flag vive numa ref porque o efeito abaixo **precisa** do valor atual sem
  // re-assinar quando um save começa — ler `pending` direto faria o efeito rodar
  // de novo no meio da operação. Ela é escrita num efeito (nunca no render) e
  // lida pelo efeito seguinte, que roda logo depois no mesmo commit.
  const busyRef = useRef(false)
  useEffect(() => {
    busyRef.current = pending || Boolean(editingId) || deleting
  })

  useEffect(() => {
    if (busyRef.current) return
    setItems(initialItems)
  }, [initialItems])

  // Realtime: o baú é catálogo (como a loja de recompensas), então item novo,
  // edição e exclusão chegam sem F5.
  usePostgresChanges<ChestItemView>({
    table: 'chest_items',
    onUpsert: (row) => {
      setItems((current) => {
        const next = current.filter((item) => item.id !== row.id)
        next.push({
          ...row,
          // Item que entrou pelo Realtime não traz o nome da casa (vem do
          // select do servidor): procura na lista ou cai no que já se sabe.
          houseName:
            row.houseName ??
            current.find((item) => item.house_id === row.house_id)?.houseName ??
            null,
        })
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

  // Contagem do baú da casa **selecionada no form**, derivada da lista que já
  // está em memória — então o aviso de proximidade custa zero query. A barreira
  // real continua sendo o `checkChestItemLimit` no servidor (esta contagem pode
  // estar defasada se outra pessoa mexeu ao mesmo tempo).
  const itemsInSelectedHouse = useMemo(
    () => items.filter((item) => item.house_id === houseId).length,
    [items, houseId]
  )
  const limitNear =
    maxItems > 0 && itemsInSelectedHouse >= Math.floor(maxItems * 0.8)
  const limitReached = maxItems > 0 && itemsInSelectedHouse >= maxItems
  const limitBlocksCreate = limitReached && !editingId

  function resetForm() {
    setEditingId(null)
    setTitle('')
    setAttachment({ url: null, name: null, type: null })
    setHouseId(activeHouseId)
    setFormError(null)
  }

  function openEdit(item: ChestItemView) {
    setEditingId(item.id)
    setTitle(item.title)
    setAttachment({
      url: item.file_url,
      name: item.file_name,
      type: item.file_type,
    })
    // A casa do item é fixa — o select vem só para mostrar onde ele está.
    setHouseId(item.house_id)
    setFormError(null)
    setShowForm(true)
    // O form fica no topo da lista, então editar um card lá embaixo abriria o
    // form fora de vista.
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      titleRef.current?.focus({ preventScroll: true })
    })
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    const titleError = validateChestItemTitle(title)
    if (titleError) {
      setFormError(titleError)
      return
    }

    if (!attachment.url) {
      setFormError('Escolha o arquivo do item.')
      return
    }

    setFormError(null)
    setPending(true)

    try {
      const result = editingId
        ? await updateChestItem(editingId, {
            title,
            fileUrl: attachment.url,
            fileName: attachment.name,
            fileType: attachment.type ?? '',
          })
        : await createChestItem({
            houseId,
            title,
            fileUrl: attachment.url,
            fileName: attachment.name,
            fileType: attachment.type ?? '',
          })

      if (!result.ok) {
        setFormError(result.error)
        toast.error(result.error)
        return
      }

      // A linha autoritativa volta da action (tipo resolvido e `updated_at` são
      // do servidor) — entra no estado sem esperar o Realtime.
      if (result.data) {
        const row = result.data
        setItems((current) =>
          [
            ...current.filter((item) => item.id !== row.id),
            {
              ...row,
              houseName:
                houses.find((house) => house.id === row.house_id)?.name ?? null,
            },
          ].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
        )
      }

      toast.success(result.message ?? 'Item salvo.')
      setShowForm(false)
      resetForm()
    } catch {
      toast.error('Não foi possível salvar. Tente novamente.')
    } finally {
      setPending(false)
    }
  }

  async function handleDelete() {
    if (!confirmDelete || deleting) return
    setDeleting(true)
    try {
      const result = await deleteChestItem(confirmDelete.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setItems((current) => current.filter((item) => item.id !== confirmDelete.id))
      toast.success(result.message ?? 'Item excluído.')
      setConfirmDelete(null)
    } catch {
      toast.error('Não foi possível excluir. Tente novamente.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div ref={formRef} className="scroll-mt-24">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="size-5 text-amber-600" />
              Baú da casa
            </CardTitle>
            <CardDescription>
              Arquivos que os dependentes da casa podem consultar e abrir.
            </CardDescription>
            <CardAction>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-9"
                onClick={() => {
                  if (showForm) {
                    setShowForm(false)
                    resetForm()
                  } else {
                    resetForm()
                    setShowForm(true)
                  }
                }}
              >
                <Plus className="size-3.5" />
                {showForm ? 'Fechar' : 'Novo item'}
              </Button>
            </CardAction>
          </CardHeader>

          {showForm ? (
            <CardContent>
              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="chest-house">Casa</Label>
                  <select
                    id="chest-house"
                    value={houseId}
                    disabled={Boolean(editingId) || pending}
                    onChange={(event) => setHouseId(event.target.value)}
                    className="min-h-12 w-full rounded-xl border border-input bg-white px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
                  >
                    {houses.map((house) => (
                      <option key={house.id} value={house.id}>
                        {house.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Para qual casa o item fica disponível. A casa do item não muda
                    depois de criado.
                  </p>
                  {/* Aviso de proximidade do teto de itens (`chest_rules`):
                      aparece em 80% e trava o botão de adicionar no limite. A
                      barreira real é o servidor. */}
                  {maxItems > 0 && !editingId ? (
                    <p
                      role="status"
                      className={cn(
                        'rounded-xl border px-3 py-2 text-xs',
                        limitReached
                          ? 'border-red-200 bg-red-50 text-red-800'
                          : limitNear
                            ? 'border-amber-200 bg-amber-50 text-amber-800'
                            : 'border-slate-200 bg-slate-50 text-slate-600'
                      )}
                    >
                      <span className="font-medium">
                        {itemsInSelectedHouse} de {maxItems} itens nesta casa.
                      </span>{' '}
                      {limitReached
                        ? 'Exclua algum item ou aumente o limite em Configurações.'
                        : limitNear
                          ? 'Perto do limite do baú.'
                          : ''}
                    </p>
                  ) : null}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="chest-title">Título</Label>
                  <ClearableInput
                    id="chest-title"
                    ref={titleRef}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    onClear={() => setTitle('')}
                    maxLength={CHEST_ITEM_TITLE_MAX}
                    placeholder="Ex.: Aula 1 - tarefa de casa"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Único campo de texto do item, e pode repetir entre itens.
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label>Arquivo</Label>
                  <TaskAttachmentInput
                    ownerId={houseId}
                    folder={CHEST_ITEM_FOLDER}
                    url={attachment.url}
                    name={attachment.name}
                    type={attachment.type}
                    onChange={setAttachment}
                    disabled={pending}
                  />
                </div>

                {formError ? (
                  <p className="text-sm text-destructive" role="alert">
                    {formError}
                  </p>
                ) : null}

                <div className="flex flex-col gap-2">
                  <Button
                    type="submit"
                    disabled={pending || limitBlocksCreate}
                    className="w-full"
                  >
                    {pending
                      ? 'Salvando...'
                      : editingId
                        ? 'Salvar item'
                        : limitBlocksCreate
                          ? 'Limite de itens atingido'
                          : 'Adicionar ao baú'}
                  </Button>
                  {editingId ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={pending}
                      onClick={() => {
                        setShowForm(false)
                        resetForm()
                      }}
                    >
                      Cancelar
                    </Button>
                  ) : null}
                </div>
              </form>
            </CardContent>
          ) : null}
        </Card>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <ClearableInput
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onClear={() => setSearch('')}
          placeholder="Buscar item pelo título..."
          aria-label="Buscar item do baú pelo título"
          className="pl-10"
        />
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={Package}
          accent="bg-amber-100 text-amber-600"
          title="Baú vazio por enquanto"
          message="Adicione o primeiro arquivo para os dependentes da casa."
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
                <div className="flex flex-col gap-1">
                  <p className="text-base font-bold text-slate-900">{item.title}</p>
                  {item.house_id !== activeHouseId && item.houseName ? (
                    <span className="inline-flex w-fit items-center rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
                      {item.houseName}
                    </span>
                  ) : null}
                </div>

                <TaskAttachmentView
                  url={item.file_url}
                  name={item.file_name}
                  type={item.file_type}
                  htmlHref={`/api/chest-item/${item.id}`}
                />

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-9 px-3 text-xs"
                    onClick={() => openEdit(item)}
                  >
                    <Pencil className="size-3.5" />
                    Editar
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="min-h-9 px-2.5"
                    aria-label={`Excluir ${item.title}`}
                    onClick={() => setConfirmDelete(item)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </CardColumns>
      )}

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Excluir item do baú"
      >
        {confirmDelete ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-600">
              Excluir <strong>{confirmDelete.title}</strong>? O arquivo sai do
              baú da casa e os dependentes não conseguirão mais abri-lo. Não dá
              para desfazer.
            </p>
            <Button
              type="button"
              className="w-full bg-red-600 hover:bg-red-700"
              disabled={deleting}
              onClick={handleDelete}
            >
              <Trash2 className="size-4" />
              {deleting ? 'Excluindo...' : 'Excluir item'}
            </Button>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
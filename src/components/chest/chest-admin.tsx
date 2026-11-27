'use client'

import { useMemo, useRef, useState } from 'react'
import { Lock, Package, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
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
import { PageSkeleton } from '@/components/ui/page-skeleton'
import { QueryError } from '@/components/session/query-error'
import { cn } from '@/lib/utils'
import { SortSelect } from '@/components/ui/sort-select'
import { sortBy } from '@/utils/sort'
import { usePersistedSort } from '@/hooks/use-persisted-sort'
import { useKeyAction } from '@/hooks/use-key-action'
import {
  useChestAdminBundle,
  useInvalidateChest,
} from '@/hooks/queries/use-chest'
import {
  CHEST_ITEM_FOLDER,
  CHEST_ITEM_TITLE_MAX,
  validateChestItemTitle,
} from '@/utils/chest-attachment'
import { attachmentBudgetState, formatMb } from '@/utils/attachment-budget'
import { formatAttachmentSize, TASK_ATTACHMENT_MAX_MB } from '@/utils/task-attachment'
import type { ChestItemView } from './chest-types'
import type { Tables } from '@/types/database'
import { CountBadge } from '@/components/ui/count-badge'

/**
 * Tela do ADMIN no baú (ADR-0024): **acervo da casa ativa**, com título apenas.
 *
 * Forma por cima, lista por baixo — o mesmo desenho de `achievements-admin.tsx`
 * e `rewards-admin.tsx`: o form nasce recolhido atrás de "Novo item" e o
 * "Editar" de um card reusa esse mesmo form (com `scrollIntoView` + foco no
 * título) em vez de um editor dentro de cada card.
 *
 * **Emenda "baú por casa":** o acervo é **da casa selecionada**, não do ADMIN.
 * Antes a lista mostrava os itens de todas as casas que ele controlava (com chip
 * do nome nos de outra casa) e o form tinha um "Casa" para escolher — o que
 * transformava o baú num acervo pessoal e ainda guardava item de casa que o
 * ADMIN não está olhando. Agora não há select: o item nasce na casa ativa, a lista
 * é dela e o chip do nome saiu (todos os itens são da mesma casa — o chip só faria
 * sentido entre casas). Trocar a casa ativa já troca o acervo exibido.
 */
const EMPTY_ITEMS: ChestItemView[] = []

export function ChestAdmin({
  houseId,
  houseName,
}: {
  /** Casa ativa — é dela o acervo e é nela que o item novo nasce. */
  houseId: string
  /** Nome da casa ativa, só para o texto do form. */
  houseName: string
}) {
  const invalidateChest = useInvalidateChest()
  const { data, isPending: bundlePending, refetch } =
    useChestAdminBundle(houseId)
  const items = data?.items ?? EMPTY_ITEMS
  const maxMb = data?.maxMb ?? 0
  const usageBytes = data?.usageBytes ?? 0
  const attachmentsAllowed = data?.attachmentsAllowed ?? true
  const [search, setSearch] = useState('')
  const [sort, setSort] = usePersistedSort('sort:chest-admin', 'created:desc')

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  useKeyAction('Escape', () => {
    setShowForm(false)
    resetForm()
  }, { enabled: showForm })
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

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

  // Realtime: o baú é catálogo — invalida o bundle com a casa selecionada.
  usePostgresChanges<Tables<'chest_items'>>({
    table: 'chest_items',
    filter: `house_id=eq.${houseId}`,
    onUpsert: () => invalidateChest(houseId),
    onDelete: () => invalidateChest(houseId),
  })

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    if (!term) return items
    return items.filter((item) =>
      item.title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(term)
    )
  }, [items, search])

  const sortedItems = useMemo(() => {
    const [key, direction] = sort.split(':')
    const getter = (item: (typeof items)[number]) => {
      switch (key) {
        case 'title':
          return item.title
        case 'created':
        default:
          return item.created_at
      }
    }
    return sortBy(filtered, getter, direction === 'desc' ? 'desc' : 'asc')
  }, [filtered, sort])

  // Limite da casa **por peso** (ADR-0027). Os bytes vêm do servidor e o
  // predicado é o mesmo (`attachmentBudgetState`), então a cor daqui não pode
  // divergir da recusa do `createChestItem`.
  //
  // A barreira continua sendo o servidor, e aqui **não** desligamos o botão: o
  // tamanho do arquivo que está por vir só é conhecido depois que o browser o
  // envia, então uma casa em 99,9 MB ainda cabe um material pequeno — desligar o
  // botão aqui seria recusar algo que cabe. O aviso vermelho + a recusa no
  // servidor é o par certo.
  const budget = attachmentBudgetState(usageBytes, maxMb)

  // A casa desligou os anexos do baú? (ADR-0026). Como o item nasce na casa
  // ativa, é esta casa que decide — um booleano basta (o mapa por casa que existia
  // foi junto com o select de casa).
  const attachmentsBlocked = !attachmentsAllowed

  function resetForm() {
    setEditingId(null)
    setTitle('')
    setAttachment({ url: null, name: null, type: null })
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

      // A linha autoritativa volta da action — invalida o bundle para o
      // acervo e o peso (`usageBytes`) refletirem.
      void invalidateChest(houseId)

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
      void invalidateChest(houseId)
      toast.success(result.message ?? 'Item excluído.')
      setConfirmDelete(null)
    } catch {
      toast.error('Não foi possível excluir. Tente novamente.')
    } finally {
      setDeleting(false)
    }
  }

  // 1ª visita sem cache: skeleton; com cache (IndexedDB) renderiza na hora.
  if (bundlePending && !data) return <PageSkeleton cards={3} />
  if (!data) return <QueryError onRetry={() => void refetch()} />

  return (
    <div className="flex flex-col gap-4">
      <div ref={formRef} className="scroll-mt-24">
        <Card className="relative">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="size-5 text-amber-600" />
              Baú da casa
              <CountBadge count={items.length} />
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
                {showForm ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
                {!showForm ? 'Novo item' : null}
              </Button>
            </CardAction>
          </CardHeader>
          {showForm ? (
            <CardContent>
              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                {/* Sem select de casa: o item nasce na casa ativa. A informação
                    continua visível — o texto diz qual é — mas não há escolha,
                    que era o que transformava o baú num acervo do ADMIN. */}
                <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  O item vai para o baú da casa <strong className="font-semibold text-slate-800">{houseName}</strong> (a casa
                  selecionada agora). Para trocar o acervo, mude a casa ativa em{' '}
                  <a href="/dashboard/admin/houses" className="font-medium text-primary underline-offset-4 hover:underline">
                    Casas
                  </a>
                  .
                </p>
                {/* Aviso de proximidade do teto de peso (`attachment_budget`): o número é do
                    storage (medido no servidor), o tom é o mesmo predicado da
                    barreira. Em 80% vira aviso, no limite vira bloqueio real. */}
                {maxMb > 0 && !editingId ? (
                  <p
                    role="status"
                    className={cn(
                      'rounded-xl border px-3 py-2 text-xs',
                      budget.reached
                        ? 'border-red-200 bg-red-50 text-red-800'
                        : budget.near
                          ? 'border-amber-200 bg-amber-50 text-amber-800'
                          : 'border-slate-200 bg-slate-50 text-slate-600'
                    )}
                  >
                    <span className="font-medium">
                      {formatAttachmentSize(budget.countedBytes)} de{' '}
                      {formatMb(maxMb)} nesta casa.
                    </span>{' '}
                    {budget.reached
                      ? 'O limite foi atingido — exclua algum anexo, troque um material por um menor ou aumente o limite em Configurações.'
                      : budget.near
                        ? `Perto do limite. Sobram ${formatAttachmentSize(budget.freeBytes)}.`
                        : `Anexos da casa (baú e tarefas) até ${TASK_ATTACHMENT_MAX_MB} MB cada.`}
                  </p>
                ) : null}

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
                  {attachmentsBlocked ? (
                    // Item do baú é acervo de arquivo: sem anexo não há o que
                    // abrir, então o form inteiro para aqui. A barreira real é o
                    // `createChestItem` (que recusa com a mesma mensagem).
                    <div className="flex items-start gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5">
                      <Lock className="mt-0.5 size-4 shrink-0 text-slate-400" />
                      <p className="text-xs text-slate-500">
                        Os anexos estão desativados nesta casa — não dá para adicionar
                        nem trocar material. Para usar o baú de novo, ligue a opção em
                        Configurações. Os itens que já estão aqui continuam listados e
                        podem ser excluídos.
                      </p>
                    </div>
                  ) : (
                    <TaskAttachmentInput
                      ownerId={houseId}
                      folder={CHEST_ITEM_FOLDER}
                      url={attachment.url}
                      name={attachment.name}
                      type={attachment.type}
                      onChange={setAttachment}
                      disabled={pending}
                    />
                  )}
                </div>

                {formError ? (
                  <p className="text-sm text-destructive" role="alert">
                    {formError}
                  </p>
                ) : null}

                <div className="flex flex-col gap-2">
                  <Button
                    type="submit"
                    disabled={pending || attachmentsBlocked}
                    className="w-full"
                  >
                    {pending
                      ? 'Salvando...'
                      : editingId
                        ? 'Salvar item'
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

       <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
         <div className="relative flex-1">
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
         <SortSelect
           value={sort}
           onChange={setSort}
           options={[
             { value: 'created:desc', label: 'Mais recentes' },
             { value: 'created:asc', label: 'Mais antigas' },
             { value: 'title:asc', label: 'Título (A-Z)' },
             { value: 'title:desc', label: 'Título (Z-A)' },
           ]}
         />
       </div>

      {items.length === 0 ? (
        <EmptyState
          icon={Package}
          accent="bg-amber-100 text-amber-600"
          title="Baú vazio por enquanto"
          message="Adicione o primeiro arquivo para os dependentes da casa."
        />
      ) : sortedItems.length === 0 ? (
        <p
          className="rounded-xl bg-slate-100 px-3 py-6 text-center text-sm text-slate-500"
          role="status"
        >
          Nenhum item encontrado para &quot;{search.trim()}&quot;.
        </p>
      ) : (
        <CardColumns className="gap-x-3 sm:columns-2 xl:columns-3 [&>*]:mb-3">
          {sortedItems.map((item) => (
            <Card key={item.id}>
              <CardContent className="flex flex-col gap-3 py-4">
                <p className="text-base font-bold text-slate-900">{item.title}</p>

                <TaskAttachmentView
                  url={item.file_url}
                  name={item.file_name}
                  type={item.file_type}
                  htmlHref={`/api/chest-item/${item.id}`}
                  // A lista é da casa ativa, então o booleano da casa decide para
                  // todos os itens (ADR-0026).
                  blocked={attachmentsBlocked}
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
'use client'

import { useEffect, useState } from 'react'
import { FileText, Film, Link2, LoaderCircle, Package } from 'lucide-react'
import { toast } from 'sonner'
import {
  copyChestItemToTask,
  listChestAttachmentsForTask,
  type ChestAttachmentOption,
} from '@/actions/chest'
import { Modal } from '@/components/ui/modal'
import {
  attachmentKind,
  attachmentKindLabel,
  formatAttachmentSize,
} from '@/utils/task-attachment'

/**
 * Seletor "**usar do baú**" — leva um material já guardado no acervo da casa para
 * o anexo da tarefa (ADR-0027).
 *
 * É uma **réplica**: o servidor copia o objeto de `chest/` para `tasks/` e o
 * baú continua com o seu. Isso é deliberado — a troca de anexo da tarefa apaga o
 * arquivo anterior (`removeStorageFile`), então apontar para o mesmo objeto
 * apagaria material do baú.
 *
 * O catálogo é buscado **ao abrir** (`listChestAttachmentsForTask`), não no render
 * de `/tasks`: é uma leitura que só interessa depois que o ADMIN decidiu usar o
 * baú, e `/tasks` é uma tela quente.
 */
export function ChestAttachmentPicker({
  open,
  onClose,
  onPick,
  disabled,
}: {
  open: boolean
  onClose: () => void
  /** Recebe os 3 campos no mesmo formato do upload. */
  onPick: (attachment: { url: string; name: string | null; type: string }) => void
  disabled?: boolean
}) {
  // `null` = carregando. O componente só é montado com o modal aberto (o input
  // controla isso), então o estado nasce limpo a cada abertura.
  const [state, setState] = useState<{
    items: ChestAttachmentOption[]
    error: string | null
  } | null>(null)
  const [copyingId, setCopyingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    listChestAttachmentsForTask()
      .then((result) => {
        if (cancelled) return
        setState({
          items: result.ok ? result.data : [],
          error: result.ok ? null : result.error,
        })
      })
      .catch(() => {
        if (cancelled) return
        setState({ items: [], error: 'Não foi possível carregar o baú da casa.' })
      })

    return () => {
      cancelled = true
    }
  }, [])

  async function handlePick(item: ChestAttachmentOption) {
    if (copyingId || disabled) return
    setCopyingId(item.id)
    try {
      const result = await copyChestItemToTask(item.id)
      if (!result.ok) {
        const message = result.error
        setState((current) => (current ? { ...current, error: message } : current))
        toast.error(message)
        return
      }
      onPick(result.data)
      toast.success(`"${item.title}" foi copiado do baú para o anexo.`)
      onClose()
    } catch {
      toast.error('Não foi possível copiar o material do baú.')
    } finally {
      setCopyingId(null)
    }
  }

  const items = state?.items ?? []
  const loading = state === null

  return (
    <Modal open={open} onClose={onClose} title="Usar material do baú">
      <div className="flex flex-col gap-3">
        <p className="text-xs text-slate-500">
          O arquivo é <strong className="font-medium text-slate-700">copiado</strong>{' '}
          para o anexo desta tarefa. O baú continua guardando o material dele, e os
          dois passam a contar no limite de anexos da casa.
        </p>

        {loading ? (
          <p className="flex items-center justify-center gap-2 py-6 text-sm text-slate-500">
            <LoaderCircle className="size-4 animate-spin" />
            Carregando o baú…
          </p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-6 text-center">
            <Package className="size-6 text-slate-400" />
            <p className="text-sm text-slate-600">
              O baú desta casa está vazio.
            </p>
            <p className="text-xs text-slate-500">
              Guarde um arquivo no Baú para poder usá-lo como anexo depois.
            </p>
          </div>
        ) : (
          <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
            {items.map((item) => {
              const kind = attachmentKind(item.fileType)
              const isLink = kind === 'link'
              const copying = copyingId === item.id

              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => void handlePick(item)}
                    disabled={Boolean(copyingId) || disabled}
                    className="flex w-full min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left shadow-sm transition-all duration-200 hover:bg-slate-50 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                      {copying ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : isLink ? (
                        <Link2 className="size-4" />
                      ) : kind === 'video' ? (
                        <Film className="size-4" />
                      ) : (
                        <FileText className="size-4" />
                      )}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium text-slate-700">
                        {item.title}
                      </span>
                      <span className="text-xs text-slate-400">
                        {attachmentKindLabel(kind)}
                        {isLink
                          ? ' · não ocupa espaço'
                          : item.bytes === null
                            ? ' · tamanho indisponível'
                            : ` · ${formatAttachmentSize(item.bytes)}`}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {state?.error ? (
          <p className="text-sm text-destructive" role="alert">
            {state.error}
          </p>
        ) : null}
      </div>
    </Modal>
  )
}
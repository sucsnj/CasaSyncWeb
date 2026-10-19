'use client'

import { useState } from 'react'
import {
  FileText,
  Film,
  Link2,
  LoaderCircle,
  Package,
  Paperclip,
  TriangleAlert,
  X,
} from 'lucide-react'
import { uploadMedia } from '@/utils/media'
import { ChestAttachmentPicker } from '@/components/tasks/chest-attachment-picker'
import {
  attachmentKind,
  attachmentKindLabel,
  attachmentLinkHost,
  isAllowedAttachmentType,
  LINK_ATTACHMENT_TYPE,
  normalizeAttachmentLink,
  resolveAttachmentType,
  TASK_ATTACHMENT_ACCEPT,
  TASK_ATTACHMENT_FOLDER,
  TASK_ATTACHMENT_MAX_MB,
  validateAttachmentLink,
} from '@/utils/task-attachment'
import { cn } from '@/lib/utils'

/**
 * Seletor de anexo: **um arquivo ou um link** por item (imagem, vídeo, PDF,
 * página HTML — ou um endereço http/https da web).
 *
 * O arquivo vai para o bucket público `casasync-media`, na pasta
 * `<folder>/<ownerId>/<uuid>.<ext>` — o nome original fica só para exibição. O
 * **link não sobe para lugar nenhum**: a URL é gravada como está e o clique abre
 * em nova aba.
 *
 * Valida **antes** de enviar (tamanho e tipo, ou o esquema do link) para não
 * gastar upload com arquivo recusado — mas quem barra de verdade é o servidor,
 * na action: `file.type` e a URL chegam do browser e o `accept` do input é
 * contornável.
 *
 * **`folder` é opcional** (ADR-0024): o baú reusa este componente com a pasta
 * `chest/` e o mesmo teto/lista de tipos. O default mantém o comportamento da
 * tarefa idêntico — quem não passa a prop nem percebe a mudança.
 *
 * **`chestSource` é opcional** (ADR-0027): a **tarefa** pode "usar do baú" — o
 * servidor copia um material do acervo da casa para o anexo. O baú, que também
 * usa este componente, não passa a prop (seria buscar item dele mesmo para ele).
 */
export function TaskAttachmentInput({
  ownerId,
  url,
  name,
  type,
  onChange,
  disabled,
  folder = TASK_ATTACHMENT_FOLDER,
  chestSource = false,
}: {
  ownerId: string
  url?: string | null
  name?: string | null
  type?: string | null
  /** Recebe os 3 campos de uma vez — a action grava ou limpa em conjunto. */
  onChange: (attachment: {
    url: string | null
    name: string | null
    type: string | null
  }) => void
  disabled?: boolean
  /**
   * Pasta do bucket onde o arquivo é enviado. Default = `tasks/` (a tarefa); o
   * baú passa `chest/`, e a validação do servidor cobra a mesma pasta do lado
   * da escrita.
   */
  folder?: string
  /**
   * Oferece "**Usar do baú**" (ADR-0027) — só a tarefa passa. Default desligado
   * mantém o baú exatamente como está.
   */
  chestSource?: boolean
}) {
  const kind = attachmentKind(type)
  const isLink = kind === 'link'

  // O modo nasce do anexo atual (quem edita um item que já tem link abre no modo
  // link) e acompanha a prop: ajustar estado durante o render é o padrão do
  // React para "prop mudou", sem efeito e sem cascata.
  const derivedMode = isLink ? 'link' : 'file'
  const [mode, setMode] = useState<'file' | 'link'>(derivedMode)
  const [lastMode, setLastMode] = useState(derivedMode)
  if (derivedMode !== lastMode) {
    setLastMode(derivedMode)
    setMode(derivedMode)
  }

  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [linkDraft, setLinkDraft] = useState('')
  const [chestOpen, setChestOpen] = useState(false)

  async function handleFile(file: File | undefined) {
    if (!file || uploading || disabled) return

    const resolvedType = resolveAttachmentType(file)

    if (!isAllowedAttachmentType(resolvedType)) {
      setError('Formato não aceito. Envie imagem, vídeo, PDF ou página HTML.')
      return
    }
    if (file.size > TASK_ATTACHMENT_MAX_MB * 1024 * 1024) {
      setError(`O arquivo passa de ${TASK_ATTACHMENT_MAX_MB} MB.`)
      return
    }

    setError(null)
    setUploading(true)
    try {
      const uploaded = await uploadMedia(
        folder as Parameters<typeof uploadMedia>[0],
        file,
        ownerId
      )
      if (!uploaded) throw new Error('Falha ao enviar o arquivo.')
      onChange({
        url: uploaded,
        name: file.name.slice(0, 120),
        type: resolvedType,
      })
    } catch {
      // Upload falhou: mantém o anexo atual (o form continua válido).
      setError('Não foi possível enviar o arquivo. Tente novamente.')
    } finally {
      setUploading(false)
    }
  }

  function handleSaveLink() {
    const error = validateAttachmentLink(linkDraft)
    if (error) {
      setError(error)
      return
    }
    // Grava o link **normalizado** (o mesmo que o servidor validou): esquema em
    // minúsculas, espaço/%20 resolvidos, sem sobra de digitação. O que é
    // validado é o que vai para o `href` do chip.
    const normalized = normalizeAttachmentLink(linkDraft)
    if (!normalized) {
      setError('Link inválido.')
      return
    }
    setError(null)
    // `name` fica nulo: link não tem "nome de arquivo" — o chip mostra o domínio.
    onChange({ url: normalized, name: null, type: LINK_ATTACHMENT_TYPE })
    setLinkDraft('')
  }

  function handleRemove() {
    setError(null)
    setLinkDraft('')
    onChange({ url: null, name: null, type: null })
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Alternador: o anexo é OU um arquivo OU um link — nunca os dois. */}
      <div
        role="group"
        aria-label="Tipo do anexo"
        className="inline-flex w-fit rounded-xl border border-slate-200 bg-slate-50 p-1"
      >
        {(['file', 'link'] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={mode === option}
            onClick={() => {
              setError(null)
              setMode(option)
            }}
            className={cn(
              'inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-all duration-200 active:scale-95',
              mode === option
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            )}
          >
            {option === 'file' ? (
              <Paperclip className="size-3.5" />
            ) : (
              <Link2 className="size-3.5" />
            )}
            {option === 'file' ? 'Arquivo' : 'Link'}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {url ? (
          <span className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            {kind === 'image' ? (
              <img
                src={url}
                alt=""
                className="size-10 shrink-0 rounded-lg border border-slate-200 object-cover"
              />
            ) : (
              <span
                className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-lg',
                  isLink
                    ? 'bg-sky-50 text-sky-600'
                    : 'bg-blue-50 text-blue-600'
                )}
              >
                {isLink ? (
                  <Link2 className="size-5" />
                ) : kind === 'video' ? (
                  <Film className="size-5" />
                ) : (
                  <FileText className="size-5" />
                )}
              </span>
            )}
            <span className="flex min-w-0 flex-col">
              {/* Link: domínio inteiro, sem `truncate` — cortar o final do host
                  esconderia o domínio real (mesmo cuidado do chip de exibição).
                  Nome de arquivo pode ser cortado, ele não é destino. */}
              <span
                className={cn(
                  'text-sm font-medium text-slate-700',
                  isLink ? 'break-all' : 'truncate'
                )}
              >
                {isLink ? attachmentLinkHost(url) : (name ?? 'arquivo')}
              </span>
              <span className="text-xs text-slate-400">
                {isLink ? 'link da web · site externo' : attachmentKindLabel(kind)}
              </span>
            </span>
            <button
              type="button"
              aria-label="Remover anexo"
              disabled={disabled || uploading}
              onClick={handleRemove}
              className="ml-1 flex size-7 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-white hover:text-slate-700 disabled:pointer-events-none disabled:opacity-50"
            >
              <X className="size-4" />
            </button>
          </span>
        ) : (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-slate-400">
            {mode === 'link' ? (
              <Link2 className="size-5" />
            ) : (
              <Paperclip className="size-5" />
            )}
          </span>
        )}

        {mode === 'link' ? (
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="url"
                inputMode="url"
                value={linkDraft}
                onChange={(event) => setLinkDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    handleSaveLink()
                  }
                }}
                placeholder="https://exemplo.com/aula"
                aria-label="Endereço do link"
                disabled={disabled || uploading || Boolean(url)}
                className="min-h-12 min-w-40 flex-1 rounded-xl border border-input bg-white px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
              />
              <button
                type="button"
                onClick={handleSaveLink}
                disabled={disabled || uploading || !linkDraft.trim()}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-medium text-white shadow-lg shadow-blue-500/25 transition-all duration-200 hover:bg-blue-700 active:scale-95 disabled:pointer-events-none disabled:opacity-60"
              >
                <Link2 className="size-4" />
                Salvar link
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              {url
                ? 'Remova o anexo atual para cadastrar outro link.'
                : 'Endereços http:// e https://. O link abre em uma nova aba do navegador.'}
            </p>
          </div>
        ) : (
          <>
            <label
              className={cn(
                'inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition-all duration-200',
                'hover:bg-slate-50 active:scale-95',
                (disabled || uploading) &&
                  'pointer-events-none opacity-50'
              )}
            >
              {uploading ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Paperclip className="size-4" />
              )}
              {uploading
                ? 'Enviando…'
                : url
                  ? 'Trocar arquivo'
                  : 'Anexar arquivo'}
              <input
                type="file"
                accept={TASK_ATTACHMENT_ACCEPT}
                className="sr-only"
                disabled={disabled || uploading}
                onChange={(event) => {
                  handleFile(event.target.files?.[0])
                  event.target.value = ''
                }}
              />
            </label>

            {/* Terceira porta de entrada do anexo (ADR-0027): em vez de reenviar o
                arquivo, o ADMIN replica um material que já está no baú da casa. O
                servidor faz a cópia e devolve os 3 campos — o mesmo formato do
                upload, então daqui em diante é o mesmo anexo. */}
            {chestSource ? (
              <button
                type="button"
                onClick={() => setChestOpen(true)}
                disabled={disabled || uploading}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-all duration-200 hover:bg-slate-50 active:scale-95 disabled:pointer-events-none disabled:opacity-50"
              >
                <Package className="size-4" />
                Usar do baú
              </button>
            ) : null}
          </>
        )}
      </div>

      {mode === 'file' ? (
        <p className="text-xs text-muted-foreground">
          Imagem, vídeo, PDF ou página HTML — até {TASK_ATTACHMENT_MAX_MB} MB. O
          dependente abre o arquivo em uma nova aba do navegador.
        </p>
      ) : null}

      {error ? (
        <p
          className="flex items-center gap-1.5 text-xs font-medium text-destructive"
          role="alert"
        >
          <TriangleAlert className="size-3.5 shrink-0" />
          {error}
        </p>
      ) : null}

      {/* Montado só enquanto aberto (o estado nasce limpo a cada vez) e só na
          tarefa — o catálogo do baú é buscado aqui, ao abrir. */}
      {chestSource && chestOpen ? (
        <ChestAttachmentPicker
          open
          onClose={() => setChestOpen(false)}
          onPick={(next) => {
            setError(null)
            onChange(next)
          }}
          disabled={disabled}
        />
      ) : null}
    </div>
  )
}

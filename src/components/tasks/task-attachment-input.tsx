'use client'

import { useState } from 'react'
import { FileText, Film, LoaderCircle, Paperclip, TriangleAlert, X } from 'lucide-react'
import { uploadMedia } from '@/utils/media'
import {
  TASK_ATTACHMENT_ACCEPT,
  TASK_ATTACHMENT_FOLDER,
  TASK_ATTACHMENT_MAX_MB,
  attachmentKind,
  attachmentKindLabel,
  isAllowedAttachmentType,
  resolveAttachmentType,
} from '@/utils/task-attachment'
import { cn } from '@/lib/utils'

/**
 * Seletor de anexo da tarefa: **um arquivo por tarefa** (imagem, vídeo, PDF ou
 * página HTML). O upload vai para o bucket público `casasync-media`, na pasta
 * `tasks/<houseId>/<uuid>.<ext>` — o nome original fica só para exibição.
 *
 * Valida **antes** de enviar (tamanho e tipo) para não gastar upload com
 * arquivo recusado — mas quem barra de verdade é o servidor, na action: o
 * `file.type` vem do browser e o `accept` do input é contornável.
 */
export function TaskAttachmentInput({
  ownerId,
  url,
  name,
  type,
  onChange,
  disabled,
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
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      const uploaded = await uploadMedia(TASK_ATTACHMENT_FOLDER, file, ownerId)
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

  const kind = attachmentKind(type)

  return (
    <div className="flex flex-col gap-2">
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
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                {kind === 'video' ? (
                  <Film className="size-5" />
                ) : (
                  <FileText className="size-5" />
                )}
              </span>
            )}
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium text-slate-700">
                {name ?? 'arquivo'}
              </span>
              <span className="text-xs text-slate-400">{attachmentKindLabel(kind)}</span>
            </span>
            <button
              type="button"
              aria-label="Remover anexo"
              disabled={disabled || uploading}
              onClick={() => {
                setError(null)
                onChange({ url: null, name: null, type: null })
              }}
              className="ml-1 flex size-7 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-white hover:text-slate-700 disabled:pointer-events-none disabled:opacity-50"
            >
              <X className="size-4" />
            </button>
          </span>
        ) : (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-slate-400">
            <Paperclip className="size-5" />
          </span>
        )}

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
      </div>

      <p className="text-xs text-muted-foreground">
        Imagem, vídeo, PDF ou página HTML — até {TASK_ATTACHMENT_MAX_MB} MB.
        O dependente abre o arquivo em uma nova aba do navegador.
      </p>

      {error ? (
        <p className="flex items-center gap-1.5 text-xs font-medium text-destructive" role="alert">
          <TriangleAlert className="size-3.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  )
}
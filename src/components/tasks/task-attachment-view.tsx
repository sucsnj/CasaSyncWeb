'use client'

import { FileText, Film, Globe, ImageIcon, Paperclip } from 'lucide-react'
import {
  attachmentKind,
  attachmentKindLabel,
  type TaskAttachmentKind,
} from '@/utils/task-attachment'

const KIND_ICON: Record<TaskAttachmentKind, typeof FileText> = {
  image: ImageIcon,
  video: Film,
  pdf: FileText,
  html: Globe,
}

/**
 * Anexo da tarefa na tela — **abre em nova aba do navegador** (`<a target>` de
 * verdade, então ctrl/ botão do meio também funcionam).
 *
 * Abrir a URL pública do storage já entrega o comportamento certo por tipo,
 * sem viewer no app: o browser **renderiza** a página HTML, mostra o PDF no
 * visualizador nativo, toca o vídeo e exibe a imagem. O que este componente
 * decide é apenas a **aparência** (miniatura para imagem, chip para os demais).
 *
 * Anexa a uma imagem antiga (`image_url` sem `attachment_type`) cai no mesmo
 * caminho de imagem — o `attachmentKind` devolve `image` quando não há tipo.
 */
export function TaskAttachmentView({
  url,
  name,
  type,
}: {
  url: string
  name?: string | null
  type?: string | null
}) {
  const kind = attachmentKind(type)
  const label = name ?? attachmentKindLabel(kind)

  // `noopener`/`noreferrer`: a aba nova não ganha acesso à origem do app.
  const openProps = {
    href: url,
    target: '_blank',
    rel: 'noopener noreferrer',
  } as const

  if (kind === 'image') {
    return (
      <a
        {...openProps}
        title={`Abrir ${label} em uma nova aba`}
        className="block w-full overflow-hidden rounded-xl border border-slate-200 transition-opacity hover:opacity-90"
      >
        <img
          src={url}
          alt={label}
          className="h-32 w-full bg-slate-50 object-cover"
        />
        <span className="flex items-center gap-1.5 border-t border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-500">
          <ImageIcon className="size-3.5 shrink-0" />
          <span className="truncate">{label}</span>
        </span>
      </a>
    )
  }

  const Icon = KIND_ICON[kind]

  return (
    <a
      {...openProps}
      title={`Abrir ${label} em uma nova aba`}
      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left transition-colors hover:bg-slate-50 active:scale-[0.99]"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
        <Icon className="size-5" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium text-slate-700">{label}</span>
        <span className="flex items-center gap-1 text-xs text-slate-400">
          <Paperclip className="size-3" />
          {attachmentKindLabel(kind)} · abrir em nova aba
        </span>
      </span>
    </a>
  )
}
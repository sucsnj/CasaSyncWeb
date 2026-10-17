'use client'

import {
  ExternalLink,
  FileText,
  Film,
  Globe,
  ImageIcon,
  Link2,
  Paperclip,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  attachmentKind,
  attachmentKindLabel,
  attachmentLinkHost,
  type TaskAttachmentKind,
} from '@/utils/task-attachment'

const KIND_ICON: Record<TaskAttachmentKind, typeof FileText> = {
  image: ImageIcon,
  video: Film,
  pdf: FileText,
  html: Globe,
  link: Link2,
}

/**
 * Anexo da tarefa na tela — **abre em nova aba do navegador** (`<a target>` de
 * verdade, então ctrl/ botão do meio também funcionam).
 *
 * Abrir a URL pública do storage já entrega o comportamento certo para imagem,
 * vídeo e PDF. **O HTML é a exceção**: o Supabase Storage força `text/plain`
 * nesse tipo (mitigação de XSS deliberada), então abrir a URL mostraria o
 * **código** da página. Para ele, o link vai para a rota do app
 * (`/api/task-attachment/<id>`), que devolve os bytes com `text/html` e uma CSP
 * `sandbox` — a página renderiza numa **origem opaca**, sem acesso ao app.
 *
 * O que este componente decide é apenas a **aparência** (miniatura para imagem,
 * chip para os demais).
 *
 * Anexo a uma imagem antiga (`image_url` sem `attachment_type`) cai no mesmo
 * caminho de imagem — o `attachmentKind` devolve `image` quando não há tipo.
 */
export function TaskAttachmentView({
  url,
  name,
  type,
  taskId,
  hideFileName = false,
  htmlHref,
}: {
  url: string
  name?: string | null
  type?: string | null
  /** Id da tarefa — necessário só para o anexo HTML (ver acima). */
  taskId?: string
  /**
   * Esconde o **nome do arquivo** de página HTML, mostrando só o rótulo do
   * tipo ("Página"). Usado no cartão do **dependente**: o nome de uma página
   * exportada ("Untitled.html", "aula-3-semana.html") é ruído — o que importa
   * ali é que existe uma página para abrir. O ADMIN continua vendo o nome, que
   * ele mesmo escolheu no upload. Imagem, vídeo e PDF seguem mostrando o nome
   * nos dois lados.
   */
  hideFileName?: boolean
  /**
   * Rota do app que serve o anexo **HTML** deste arquivo (ADR-0024). O default
   * é a rota da tarefa; o baú passa a dele — o isolamento (`CSP: sandbox`) e o
   * motivo (o Supabase força `text/plain` em `text/html`) são exatamente os
   * mesmos, então só muda quem autoriza a leitura.
   */
  htmlHref?: string
}) {
  const kind = attachmentKind(type)
  const kindLabel = attachmentKindLabel(kind)
  const showName = !(hideFileName && kind === 'html')
  const label = showName ? (name ?? kindLabel) : kindLabel

  // O HTML é o único tipo que sai pela rota do app; imagem, vídeo e PDF vão
  // direto para a URL pública do storage (o gateway entrega o content-type certo
  // para eles). O **link** também vai pela URL, mas para um site externo.
  const htmlTarget = htmlHref ?? (taskId ? `/api/task-attachment/${taskId}` : null)

  // Link: o chip mostra o domínio (a URL costuma vir com parâmetros de
  // rastreio) e a completa fica no `title`, que o hover do browser mostra.
  const linkHost = kind === 'link' ? attachmentLinkHost(url) : null

  // `noopener`/`noreferrer`: a aba nova não ganha acesso à origem do app.
  const openProps = {
    href: kind === 'html' && htmlTarget ? htmlTarget : url,
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
      title={
        kind === 'link'
          ? `${url}\n\nAbrir em uma nova aba`
          : `Abrir ${label} em uma nova aba`
      }
      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left transition-colors hover:bg-slate-50 active:scale-[0.99]"
    >
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-lg',
          kind === 'link'
            ? 'bg-sky-50 text-sky-600'
            : 'bg-blue-50 text-blue-600'
        )}
      >
        <Icon className="size-5" />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        {kind === 'link' ? (
          // **O domínio nunca é truncado** (quebra linha em vez de cortar): o
          // reticências do `truncate` cai no FINAL do host, que é onde mora o
          // domínio real — `www.youtube.com…` lendo como `www.youtube.com` quando
          // a URL era `www.youtube.com.evil.com`. Domínio inteiro visível, ou o
          // chip mente sobre para onde vai.
          <span className="break-all text-sm font-medium text-slate-700">
            {linkHost}
          </span>
        ) : (
          // Nome de arquivo não é destino: aqui o corte é só estética e evita
          // card alto.
          <span className="truncate text-sm font-medium text-slate-700">
            {label}
          </span>
        )}
        {kind === 'link' ? (
          // O selo é o aviso de que o destino é **fora do app** — é o que
          // distingue um link real de um texto que o celular linkificou sozinho.
          <span className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
            <span className="inline-flex w-fit items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 font-medium text-sky-700">
              <ExternalLink className="size-3" />
              Site externo
            </span>
            <span>abrir em nova aba</span>
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-slate-400">
            <Paperclip className="size-3" />
            {`${showName ? `${kindLabel} · ` : ''}abrir em nova aba`}
          </span>
        )}
      </span>
    </a>
  )
}
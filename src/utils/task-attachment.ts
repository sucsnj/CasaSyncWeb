/**
 * Anexo da tarefa — regras puras (módulo sem `'use server'`, importado pelo
 * client **e** pelas Server Actions).
 *
 * O anexo é **um arquivo por tarefa** e reusa a coluna `tasks.image_url` (que
 * hoje guarda a imagem da tarefa) + as duas colunas novas `attachment_name` /
 * `attachment_type`. Tarefa antiga, com `image_url` e sem `attachment_type`,
 * continua sendo tratada como imagem inline — o mesmo caminho de antes.
 *
 * Por que o teto de 5 MB: o bucket é o `casasync-media`, do plano Hobby (1 GB no
 * total) — e o upload em tarefa tinha sido desligado justamente para não inflar
 * o storage. O número vem de {@link MEDIA_FILE_MAX_MB} porque ele é o **mesmo
 * teto de todo arquivo do bucket** (`storage.buckets.file_size_limit`), não uma
 * escolha só do anexo: dois tetos diferentes para o mesmo bucket é como a conta
 * do storage deixa de fechar (ADR-0027).
 */
import { MEDIA_FILE_MAX_MB } from '@/utils/media'

export const TASK_ATTACHMENT_MAX_MB = MEDIA_FILE_MAX_MB
export const TASK_ATTACHMENT_MAX_BYTES = MEDIA_FILE_MAX_MB * 1024 * 1024

/**
 * Tipos aceitos, pelo MIME. A lista é fechada e o servidor **valida contra ela**
 * (fail-closed): o `contentType` do upload é enviado pelo browser, então não é
 * confiável — o que vale é a checagem aqui, no servidor.
 */
export const TASK_ATTACHMENT_TYPES = [
  // Imagens (o formato legado da tarefa — abrem em guia nova)
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  // Vídeo
  'video/mp4',
  'video/webm',
  'video/quicktime',
  // Documento
  'application/pdf',
  // Página — abre RENDERIZADA, não como código
  'text/html',
] as const

export type TaskAttachmentType = (typeof TASK_ATTACHMENT_TYPES)[number]

/**
 * **Link da web** — o terceiro tipo de anexo que não é arquivo: nada sobe para o
 * storage, a URL é gravada como está e o clique abre em nova aba.
 *
 * O MIME `text/url` é o mesmo que o `<input type="url">` do HTML usa, e é o que
 * fica gravado em `attachment_type`/`file_type` para a tela saber que aquilo é
 * um link e não um arquivo. Ele fica **fora** de `TASK_ATTACHMENT_TYPES` de
 * propósito: aquela lista é o que o `<input type="file">` aceita e o que o
 * upload valida — um link não se escolhe num seletor de arquivos.
 */
export const LINK_ATTACHMENT_TYPE = 'text/url'

/** Tipo de anexo que é uma URL da web (não um arquivo do storage). */
export type AttachmentKind = 'image' | 'video' | 'pdf' | 'html' | 'link'

/**como o anexo é apresentado (ícone/rotulo) e como o browser o trata. */
export type TaskAttachmentKind = AttachmentKind

/** Pasta do bucket onde o anexo vive (bucket público `casasync-media`). */
export const TASK_ATTACHMENT_FOLDER = 'tasks'

/**
 * Atributo `accept` do `<input type="file">`. É só UX — quem barra de verdade é
 * o servidor (`isAllowedAttachmentType`), porque o `file.type` vem do browser.
 */
export const TASK_ATTACHMENT_ACCEPT = [
  ...TASK_ATTACHMENT_TYPES,
  'video/*',
].join(',')

const EXTENSION_TO_TYPE: Record<string, TaskAttachmentType> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  qt: 'video/quicktime',
  pdf: 'application/pdf',
  html: 'text/html',
  htm: 'text/html',
}

export function attachmentExtension(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : ''
}

/**
 * MIME a partir do nome do arquivo. Alguns browsers entregam `file.type` vazio
 * (o caso mais comum em `.html` e `.mov`), e **content-type vazio no storage faz
 * o browser BAIXAR o arquivo em vez de renderizar** — que é exatamente o
 * defeito que o anexo precisa evitar. Por isso o tipo é resolvido pela
 * extensão quando o browser não informa.
 */
export function attachmentTypeFromName(fileName: string): string {
  return EXTENSION_TO_TYPE[attachmentExtension(fileName)] ?? ''
}

export function resolveAttachmentType(file: {
  type?: string | null
  name: string
}): string {
  const declared = (file.type ?? '').split(';')[0].trim().toLowerCase()
  if ((TASK_ATTACHMENT_TYPES as readonly string[]).includes(declared)) {
    return declared
  }
  return attachmentTypeFromName(file.name)
}

export function isAllowedAttachmentType(type: string | null | undefined): boolean {
  return (TASK_ATTACHMENT_TYPES as readonly string[]).includes(
    (type ?? '').trim().toLowerCase()
  )
}

export function attachmentKind(type: string | null | undefined): TaskAttachmentKind {
  const value = (type ?? '').trim().toLowerCase()
  if (value === LINK_ATTACHMENT_TYPE) return 'link'
  if (value.startsWith('image/')) return 'image'
  if (value.startsWith('video/')) return 'video'
  if (value === 'application/pdf') return 'pdf'
  if (value === 'text/html') return 'html'
  return 'image'
}

/** Rótulo curto do tipo, usado no chip do card. */
export function attachmentKindLabel(kind: TaskAttachmentKind): string {
  switch (kind) {
    case 'image':
      return 'Imagem'
    case 'video':
      return 'Vídeo'
    case 'pdf':
      return 'PDF'
    case 'html':
      return 'Página'
    case 'link':
      return 'Link'
  }
}

/** O valor é um link da web (e não um arquivo do storage)? */
export function isLinkAttachmentType(type: string | null | undefined): boolean {
  return (type ?? '').trim().toLowerCase() === LINK_ATTACHMENT_TYPE
}

/**
 * Domínio do link, para o chip mostrar "youtube.com" em vez da URL inteira
 * (que costuma vir com parâmetros de rastreio). Cai no texto cru se a URL não
 * parse — e `''` quando nem isso existe, para o chamador não desenhar nada.
 */
export function attachmentLinkHost(url: string | null | undefined): string {
  const raw = (url ?? '').trim()
  if (!raw) return ''
  try {
    return new URL(raw).host || raw
  } catch {
    return raw
  }
}

/** Limite do link gravado — URL longa é ruído, não conteúdo. */
export const ATTACHMENT_LINK_MAX = 2000

/** Aceita os tipos comuns no `accept` — só UX; quem barra de verdade é o servidor. */
function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code < 32 || code === 127) return true
  }
  return false
}

export function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

/** Bucket público do app — nunca pode aparecer em um link (ver validação abaixo). */
export const INTERNAL_MEDIA_BUCKET = 'casasync-media'

/** Os dois únicos esquemas aceitos como link. */
const LINK_ALLOWED_PROTOCOLS = ['http:', 'https:'] as const

/**
 * Validação do **link** gravado — fail closed, no servidor. Três regras, nesta
 * ordem (a ordem importa: as duas primeiras são sobre a **URL como o browser vai
 * interpretá-la**, a terceira é sobre para onde ela aponta).
 *
 * 1. **só `http:`/`https:`.** A URL vira o `href` de um `<a>` que o dependente
 *    clica, então tudo que o browser entende como executável é barrado: é a
 *    **lista de dois esquemas**, não uma lista de bloqueio — `javascript:` (que
 *    executaria script na origem do app), `data:`, `vbscript:`, `file:`, `ftp:`,
 *    `blob:` e qualquer esquema exótico que alguém invente depois caem fora por
 *    construção, sem precisar lembrar de bloquear um a um.
 * 2. **precisa de host** e cabe em {@link ATTACHMENT_LINK_MAX} caracteres.
 * 3. **nunca pode apontar para o storage interno** (`casasync-media`) — nem no
 *    host, nem no caminho, nem na query. Um link é material externo por
 *    definição; aceitar URL do próprio bucket criaria dois jeitos de mexer no
 *    mesmo arquivo, porque a troca de anexo **apaga o arquivo antigo**
 *    (`removeStorageFile`) e um "link" não tem dono nem pasta — ele apagaria um
 *    arquivo que ele não possui. Barrar pelo **host** cobre também o subdomínio
 *    (`casasync-media.supabase.co`), e checar a **URL inteira** (e não só o
 *    caminho) cobre link que tenta *redirecionar* para dentro do storage por
 *    query.
 */
export function validateAttachmentLink(url: string): string | null {
  const raw = url.trim()
  if (!raw) return 'Informe o link.'
  if (raw.length > ATTACHMENT_LINK_MAX) {
    return `Link muito longo (máx. ${ATTACHMENT_LINK_MAX} caracteres).`
  }
  if (hasControlChars(raw)) return 'Link inválido.'

  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return 'Link inválido: inclua o endereço completo, começando com https://.'
  }

  if (
    !(LINK_ALLOWED_PROTOCOLS as readonly string[]).includes(parsed.protocol)
  ) {
    return 'Link inválido: use apenas endereços http:// ou https://.'
  }
  if (!parsed.host) {
    return 'Link inválido: falta o domínio do endereço.'
  }
  if (pointsToInternalStorage(raw, parsed)) {
    return 'Link inválido: use o campo de arquivo para anexar um arquivo do app.'
  }

  return null
}

/** O link aponta para o bucket/domínio interno do app, em qualquer posição? */
function pointsToInternalStorage(raw: string, parsed: URL): boolean {
  const token = INTERNAL_MEDIA_BUCKET
  return (
    parsed.host.toLowerCase().includes(token) ||
    parsed.pathname.toLowerCase().includes(token) ||
    parsed.search.toLowerCase().includes(token) ||
    raw.toLowerCase().includes(token)
  )
}

/**
 * O mesmo link, já **normalizado** pelo parser de URL do browser — ou `null` se
 * inválido.
 *
 * Existe para que o que é **gravado** seja exatamente o que foi validado: o
 * `href` que a tela vai renderizar é o `href` que o parser produziu, sem sobra
 * de espaço, `\t` no meio do esquema ou caminho malformado — e com o esquema
 * já normalizado em minúsculas. Validar uma coisa e guardar outra é o tipo de
 * brecha que a lista fechada de esquemas fecharia de novo.
 */
export function normalizeAttachmentLink(url: string): string | null {
  if (validateAttachmentLink(url)) return null
  try {
    return new URL(url.trim()).href
  } catch {
    return null
  }
}

/**
 * serve o arquivo (tarefa, baú) **e** o link, porque o tipo decide o caminho.
 *
 * - **link** (`text/url`): vai para `validateAttachmentLink` — nada de pasta nem
 *   nome, já que não há arquivo;
 * - **arquivo**: as 3 defesas de sempre — a URL precisa ser do bucket público na
 *   pasta do módulo (senão o ADMIN apontaria a tarefa para uma página externa — o
 *   mesmo cuidado que `sendQuickMessage` exige com `messages/` e
 *   `createAchievement` com `achievements/`), o tipo precisa estar na lista
 *   fechada, e o nome é limitado e não pode trazer caractere de controle (que
 *   quebraria o texto do card) — é o nome **original** que o ADMIN escolheu,
 *   usado só para exibição, nunca para montar caminho de arquivo (o caminho do
 *   storage é um UUID — ver `uploadMedia`).
 */
export function validateAttachment(
  url: string,
  name: string | null | undefined,
  type: string | null | undefined,
  folder: string
): string | null {
  if (isLinkAttachmentType(type)) {
    return validateAttachmentLink(url)
  }

  if (!url.includes(`/${folder}/`) || !url.includes('/casasync-media/')) {
    return 'Anexo inválido: o arquivo precisa estar no storage da casa.'
  }

  const resolved = (type ?? '').trim().toLowerCase() || attachmentTypeFromName(name ?? '')
  if (!isAllowedAttachmentType(resolved)) {
    return 'Formato de anexo não aceito. Envie imagem, vídeo, PDF, página HTML ou um link.'
  }

  const safeName = (name ?? '').trim()
  if (safeName.length > 120) {
    return 'Nome do anexo muito longo (máx. 120 caracteres).'
  }
  if (hasControlChars(safeName)) {
    return 'Nome do anexo inválido.'
  }

  return null
}

/** Valida o anexo da **tarefa** (pasta `tasks/` do bucket). */
export function validateTaskAttachment(
  url: string,
  name: string | null | undefined,
  type: string | null | undefined
): string | null {
  return validateAttachment(url, name, type, TASK_ATTACHMENT_FOLDER)
}
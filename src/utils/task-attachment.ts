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
 * o storage. 5 MB é o mesmo teto da mensagem rápida.
 */
export const TASK_ATTACHMENT_MAX_MB = 5
export const TASK_ATTACHMENT_MAX_BYTES = TASK_ATTACHMENT_MAX_MB * 1024 * 1024

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

/**como o anexo é apresentado (ícone/rotulo) e como o browser o trata. */
export type TaskAttachmentKind = 'image' | 'video' | 'pdf' | 'html'

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
  }
}

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

/**
 * Validação do anexo gravado na tarefa — **fail closed**, no servidor.
 *
 * Três defesas, nenhuma confiando no cliente:
 * 1. a URL precisa ser do bucket público, na pasta `tasks/` (senão o ADMIN
 *    apontaria a tarefa para uma página externa — o mesmo cuidado que
 *    `sendQuickMessage` exige com `messages/` e `createAchievement` com
 *    `achievements/`);
 * 2. o tipo precisa estar na lista fechada;
 * 3. o nome é limitado e não pode trazer caractere de controle (que quebraria o
 *    texto do card) — é o nome **original** que o ADMIN escolheu, usado só para
 *    exibição, nunca para montar caminho de arquivo (o caminho do storage é um
 *    UUID — ver `uploadMedia`).
 */
export function validateTaskAttachment(
  url: string,
  name: string | null | undefined,
  type: string | null | undefined
): string | null {
  if (!url.includes(`/${TASK_ATTACHMENT_FOLDER}/`) || !url.includes('/casasync-media/')) {
    return 'Anexo inválido: o arquivo precisa estar no storage da casa.'
  }

  const resolved = (type ?? '').trim().toLowerCase() || attachmentTypeFromName(name ?? '')
  if (!isAllowedAttachmentType(resolved)) {
    return 'Formato de anexo não aceito. Envie imagem, vídeo, PDF ou página HTML.'
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
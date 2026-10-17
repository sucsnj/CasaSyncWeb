import { createAdminClient } from '@/utils/supabase/admin'
import { getSessionProfile } from '@/utils/house'

/**
 * Anexo **HTML** das tarefas e do baú — núcleo compartilhado entre quem **serve**
 * os bytes (`/api/task-attachment/[taskId]`, `/api/chest-item/[itemId]`) e quem
 * **avisa antes de abrir** (`/abrir-anexo`).
 *
 * Server-only: usa o cliente service-role, então nunca pode entrar num client
 * component.
 *
 * **Por que um módulo só:** a autorização do anexo tem regra diferente por tipo
 * (dependente só abre a tarefa **dele**; no baú, qualquer membro da casa), e ela
 * é a barreira real do arquivo. Com a tela de aviso isso deixou de ser o lugar
 * único que faz a checagem — a regra passaria a existir em três arquivos, e o
 * primeiro que esquecesse abriria anexo de outra pessoa. Aqui ela mora uma vez e
 * as três telas só consomem.
 *
 * **Por que o HTML é servido pelo app:** o Supabase Storage força
 * `Content-Type: text/plain` em `text/html` (mitigação de XSS deliberada,
 * by-design), então abrir a URL pública mostraria o **código** da página. Isso
 * muda a superfície, e é o que a tela de aviso trata: o documento vem com
 * `CSP: sandbox allow-scripts`, o que dá **origem opaca** — sem cookie, sem
 * `localStorage`, sem acesso ao app, sem abrir aba e sem redirecionar a aba que o
 * abriu — e, desde a emenda de endurecimento, com `connect-src 'none'`,
 * `form-action 'none'` e `default-src 'none'`, que fecham também o envio de
 * dados por script e o carregamento de `iframe`/worker. O que **sobra** é a
 * página poder exibir qualquer coisa e carregar recurso da web: o risco residual
 * é phishing (uma tela falsa de login), não roubo de sessão (ADR-0025).
 */

/** Onde o anexo HTML pode estar — e, portanto, quem pode abri-lo. */
export type HtmlAttachmentKind = 'task' | 'chest'

export type HtmlAttachmentInfo = {
  kind: HtmlAttachmentKind
  /** Rota crua que serve os bytes — destino final do botão "Abrir Arquivo". */
  href: string
  /** URL do arquivo no storage — é daqui que a rota busca os bytes. */
  fileUrl: string
  /** Título da tarefa ou do item (contexto do material). */
  title: string
  /** Nome original do arquivo, como o tutor enviou. */
  fileName: string
  /** Só preenchidos quando `meta` foi pedido (ver `loadHtmlAttachment`). */
  senderName?: string
  houseName?: string | null
}

/** Motivo da recusa — vira o status HTTP da rota, sem ambiguidade. */
export type HtmlAttachmentFailure = 'no_session' | 'unauthorized' | 'not_found'

/**
 * Linha do anexo já **normalizada** entre os dois módulos: `tasks` guarda a URL
 * em `image_url` e o MIME em `attachment_type` (colunas herdadas do anexo
 * antigo), `chest_items` em `file_url`/`file_type`. Normalizar aqui é o que
 * segura a regra única.
 */
type NormalizedRow = {
  houseId: string
  title: string
  url: string | null
  type: string | null
  fileName: string | null
  createdBy: string | null
  /** Só a tarefa tem dono: é o que separa "meu anexo" de "anexo de outro". */
  assignedTo: string | null
}

/**
 * Carrega o anexo HTML e **autoriza** quem está pedindo.
 *
 * `meta: true` resolve também **quem enviou** e a **casa** (2 leituras em
 * `Promise.all`). É **opt-in** porque quem só serve os bytes não usa esses dados:
 * pedir sempre custaria 2 round-trips por abertura de anexo, e aqui round-trip é
 * latência (ver `AGENTS.md` §3). O `created_by` vem no mesmo select, então não há
 * query extra para descobrir quem enviou.
 */
export async function loadHtmlAttachment(
  kind: HtmlAttachmentKind,
  id: string,
  options: { meta?: boolean } = {}
): Promise<
  | { ok: true; info: HtmlAttachmentInfo }
  | { ok: false; reason: HtmlAttachmentFailure }
> {
  const { user, profile } = await getSessionProfile()
  if (!user || !profile) return { ok: false, reason: 'no_session' }

  const admin = createAdminClient()
  const row = await selectAttachmentRow(admin, kind, id)

  // Nada a servir: anexo inexistente, ou que não é HTML (imagem, vídeo, PDF e
  // link vão direto pela URL pública do storage — o gateway entrega o
  // content-type certo para eles). A mesma resposta para os dois casos, para não
  // revelar a existência do anexo.
  if (!row || !row.url || row.type !== 'text/html') {
    return { ok: false, reason: 'not_found' }
  }

  const authorized = await canOpenHtmlAttachment(admin, {
    houseId: row.houseId,
    userId: user.id,
    role: profile.user_role,
    ownsIt: kind === 'task' ? row.assignedTo === user.id : null,
  })
  if (!authorized) return { ok: false, reason: 'unauthorized' }

  const info: HtmlAttachmentInfo = {
    kind,
    href:
      kind === 'task' ? `/api/task-attachment/${id}` : `/api/chest-item/${id}`,
    fileUrl: row.url,
    title: row.title,
    fileName: row.fileName ?? (kind === 'task' ? 'anexo.html' : 'pagina.html'),
  }

  if (options.meta) {
    const [senderName, house] = await Promise.all([
      resolveSenderName(admin, row.createdBy),
      admin.from('houses').select('name').eq('id', row.houseId).maybeSingle(),
    ])
    info.senderName = senderName
    info.houseName = house.data?.name ?? null
  }

  return { ok: true, info }
}

/** Uma query, já normalizada entre `tasks` e `chest_items`. */
async function selectAttachmentRow(
  admin: ReturnType<typeof createAdminClient>,
  kind: HtmlAttachmentKind,
  id: string
): Promise<NormalizedRow | null> {
  if (kind === 'task') {
    const { data } = await admin
      .from('tasks')
      .select(
        'house_id, title, assigned_to, created_by, image_url, attachment_name, attachment_type'
      )
      .eq('id', id)
      .maybeSingle()
    if (!data) return null
    return {
      houseId: data.house_id,
      title: data.title,
      url: data.image_url,
      type: data.attachment_type,
      fileName: data.attachment_name,
      createdBy: data.created_by,
      assignedTo: data.assigned_to,
    }
  }

  const { data } = await admin
    .from('chest_items')
    .select('house_id, title, created_by, file_url, file_name, file_type')
    .eq('id', id)
    .maybeSingle()
  if (!data) return null
  return {
    houseId: data.house_id,
    title: data.title,
    url: data.file_url,
    type: data.file_type,
    fileName: data.file_name,
    createdBy: data.created_by,
    assignedTo: null,
  }
}

/**
 * Membro da casa do anexo — e, no caso da tarefa, o **dono**.
 *
 * ADMIN precisa ser `ADMIN` da casa (co-gestão por PIN vale); DEPENDENT precisa
 * estar na casa **e** ser o responsável pela tarefa. É a mesma checagem que a
 * policy de SELECT faria, aqui em service-role — porque é o canal que serve o
 * conteúdo.
 */
async function canOpenHtmlAttachment(
  admin: ReturnType<typeof createAdminClient>,
  args: {
    houseId: string
    userId: string
    role: string
    /** `null` = o anexo não tem dono (baú). */
    ownsIt: boolean | null
  }
): Promise<boolean> {
  if (args.role === 'ADMIN') {
    const { data: member } = await admin
      .from('house_members')
      .select('id')
      .eq('house_id', args.houseId)
      .eq('profile_id', args.userId)
      .eq('role', 'ADMIN')
      .maybeSingle()
    return Boolean(member)
  }

  // Tarefa de outra pessoa: nem chega a consultar a casa.
  if (args.ownsIt === false) return false

  const { data: member } = await admin
    .from('house_members')
    .select('id')
    .eq('house_id', args.houseId)
    .eq('profile_id', args.userId)
    .maybeSingle()
  return Boolean(member)
}

/**
 * Nome do tutor que enviou. O `created_by` pode ser nulo (o autor foi removido do
 * perfil e o FK é `on delete set null`), e o texto do aviso **não pode** virar
 * "arquivo enviado por undefined" — daí o fallback, que ainda evita uma query.
 */
async function resolveSenderName(
  admin: ReturnType<typeof createAdminClient>,
  createdBy: string | null
): Promise<string> {
  if (!createdBy) return 'seu tutor'
  const { data } = await admin
    .from('profiles')
    .select('full_name')
    .eq('id', createdBy)
    .maybeSingle()
  return data?.full_name ?? 'seu tutor'
}

/**
 * A **Content-Security-Policy** do anexo HTML.
 *
 * Montada como constante para que o comentário ao lado seja a fonte da verdade de
 * cada diretiva — a string é longa e easy de quebrar sem entender o porquê de cada
 * parte.
 *
* **O que fecha (e o que já vinha fechado pelo `sandbox`):**
 * - `sandbox allow-scripts`: origem **opaca** (sem cookie/`localStorage`), sem
 *   popups, sem abrir aba, sem navegar a aba que abriu, sem submissão de
 *   formulário nativo;
 * - `connect-src 'none'`: **sem `fetch`/XHR/WebSocket/`sendBeacon`** — o caminho
 *   mais limpo de levar dado digitado para fora;
 * - `form-action 'none'`: submissão de formulário (redundante com o sandbox, mas
 *   explícito no código em vez de depender da opacidade da origem);
 * - `default-src 'none'`: tudo que não estiver listado abaixo é negado —
 *   inclui `<iframe>`, `<object>`, Web Worker e `<link rel=prefetch>`.
 *
 * **O que continua aberto, e é por isso que a tela de aviso importa (ADR-0025):**
 * `img-src`/`font-src` aceitam `https:`, então a página ainda pode carregar uma
 * imagem montada com dado digitado (beacon) — e, principalmente, **nenhuma CSP
 * bloqueia navegação**: a diretiva `navigate-to` foi removida da especificação e
 * nunca foi implementada, então a página pode navegar a si mesma com o dado na
 * URL. O controle real do phishing é humano (aviso + fricção), não técnico.
 *
 * **Por que `script-src`/`style-src` aceitam `https:`:** o material do tutor é
 * página de verdade — folha de estilo de CDN, script de biblioteca, fonte da web.
 * Com a política sem `https:` (rodada anterior) o anexo abria **sem CSS e sem
 * script**, que é material inútil. O custo é o payload de phishing poder ser
 * hospedado fora — o que **não abre canal novo**: o script remoto continua sem
 * `fetch` (`connect-src 'none'`), sem formulário e sem poder ler nada do app, e
 * pode fazer exatamente o que o script inline já fazia (beacon e navegação).
 * Ou seja, é Ampliar o que já estava aberto, não abrir um canal novo.
 *
 * **Por que `'none'` e não `'self'`:** num documento sandboxed a origem é opaca
 * (`null`), então `'self'` **não casa com nada** — não é o CasaSync, é um valor
 * que não corresponde a nenhuma origem. Escrever `'self'` ali seria documentar
 * uma permissão que não existe; `'none'` diz a mesma coisa de forma verdadeira.
 */
const HTML_ATTACHMENT_CSP = [
  'sandbox allow-scripts',
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval' https:",
  "style-src 'unsafe-inline' https:",
  'img-src data: blob: https:',
  'media-src data: blob: https:',
  'font-src data: https:',
  "connect-src 'none'",
  "form-action 'none'",
].join('; ')

/**
 * Cabeçalhos da resposta do anexo HTML.
 *
 * `Content-Disposition: inline` porque a página **é renderizada** — com o tipo
 * certo, o CSS e o JS dela funcionam (limitados pela CSP acima).
 * `nosniff` impede o browser reinterpretar o tipo; `no-store` porque é conteúdo
 * por usuário, que nunca deve ficar em cache de browser nem de CDN.
 */
export function htmlAttachmentHeaders(fileName: string): Record<string, string> {
  const safeName = fileName.replace(/["\r\n]/g, '')
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': HTML_ATTACHMENT_CSP,
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': `inline; filename="${safeName}"`,
    // Conteúdo por usuário: nunca no cache do navegador nem do CDN.
    'Cache-Control': 'private, no-store, max-age=0',
  }
}
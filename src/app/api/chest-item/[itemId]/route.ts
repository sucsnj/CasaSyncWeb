import {
  htmlAttachmentHeaders,
  loadHtmlAttachment,
  type HtmlAttachmentFailure,
} from '@/utils/attachment-html'

/**
 * Serve o **arquivo HTML** de um item do baú — o único tipo que precisa passar
 * por aqui. Imagem, vídeo e PDF continuam abrindo direto pela URL pública do
 * storage (o Supabase entrega o content-type correto para eles).
 *
 * **Por que o HTML não abre pela URL pública:** o Supabase Storage força
 * `Content-Type: text/plain` em qualquer `text/html` — mitigação de XSS
 * deliberada ("For security, HTML files are returned as plain text", na
 * documentação de Storage; supabase/storage#186, fechado como by-design). Com
 * `text/plain` + `nosniff`, o browser mostra o **código** da página em vez de
 * renderizar. A rota equivalente das tarefas é `/api/task-attachment/[taskId]`;
 * aqui o isolamento é o mesmo, muda só quem autoriza a leitura (ADR-0024,
 * item 9; ADR-0025 para o aviso).
 *
 * Autorização derivada da sessão (nunca do id do cliente como escopo): o item é
 * da casa X; ADMIN precisa ser `ADMIN` de X, e qualquer **dependente** de X pode
 * abrir — o baú é material da casa, não de uma pessoa.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ itemId: string }> }
) {
  const { itemId } = await context.params

  const result = await loadHtmlAttachment('chest', itemId)
  if (!result.ok) return failureResponse(result.reason)

  const file = await fetch(result.info.fileUrl, { cache: 'no-store' })
  if (!file.ok || !file.body) {
    return new Response('Arquivo indisponível', { status: 404 })
  }

  return new Response(file.body, {
    status: 200,
    headers: htmlAttachmentHeaders(result.info.fileName),
  })
}

/** 401 sem sessão, 403 sem membro da casa, 404 sem item (sem revelar existência). */
function failureResponse(reason: HtmlAttachmentFailure): Response {
  if (reason === 'no_session') {
    return new Response('Não autorizado', { status: 401 })
  }
  if (reason === 'unauthorized') {
    return new Response('Não autorizado', { status: 403 })
  }
  return new Response('Arquivo não encontrado', { status: 404 })
}
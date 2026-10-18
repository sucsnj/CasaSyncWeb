import {
  htmlAttachmentFailureResponse,
  htmlAttachmentHeaders,
  loadHtmlAttachment,
} from '@/utils/attachment-html'

/**
 * Serve o **anexo HTML** de uma tarefa — o único tipo que precisa passar por
 * aqui. Imagem, vídeo e PDF continuam abrindo direto pela URL pública do storage
 * (o Supabase entrega o content-type correto para eles).
 *
 * **Por que o HTML não abre pela URL pública:** o Supabase Storage força
 * `Content-Type: text/plain` em qualquer `text/html` — mitigação de XSS
 * deliberada ("For security, HTML files are returned as plain text", na
 * documentação de Storage; supabase/storage#186, fechado como by-design). Com
 * `text/plain` + `nosniff`, o browser mostra o **código** da página em vez de
 * renderizar, e nenhum content-type no upload ou config do bucket contorna — é o
 * gateway.
 *
 * A resposta sai com `CSP: sandbox allow-scripts` (origem opaca: sem cookie, sem
 * acesso ao app, sem abrir aba) — o isolamento está explicado em
 * `src/utils/attachment-html.ts`, que é também onde mora a **autorização**,
 * compartilhada com a tela de aviso (`/abrir-anexo`). Aqui esta rota só busca os
 * bytes e devolve.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await context.params

  const result = await loadHtmlAttachment('task', taskId)
  if (!result.ok) {
    // 401 sem sessão · 403 sem permissão ou com os anexos da casa desligados ·
    // 404 sem anexo (sem revelar existência). O mapa mora no núcleo, junto da
    // autorização — ver `htmlAttachmentFailureResponse`.
    return htmlAttachmentFailureResponse(result.reason, 'Anexo não encontrado')
  }

  const file = await fetch(result.info.fileUrl, { cache: 'no-store' })
  if (!file.ok || !file.body) {
    return new Response('Anexo indisponível', { status: 404 })
  }

  return new Response(file.body, {
    status: 200,
    headers: htmlAttachmentHeaders(result.info.fileName),
  })
}
import { createAdminClient } from '@/utils/supabase/admin'
import { getSessionProfile } from '@/utils/house'

/**
 * Serve o **arquivo HTML** de um item do baú — o único tipo que precisa passar
 * por aqui. Imagem, vídeo e PDF continuam abrindo direto pela URL pública do
 * storage (o Supabase entrega o content-type correto para eles).
 *
 * **Por que o HTML não abre pela URL pública:** o Supabase Storage força
 * `Content-Type: text/plain` em qualquer `text/html` — mitigação deliberada de
 * XSS ("For security, HTML files are returned as plain text", na documentação de
 * Storage; supabase/storage#186, fechado como by-design). Com `text/plain` +
 * `nosniff`, o browser mostra o **código** da página em vez de renderizar, e
 * nenhum content-type no upload ou config do bucket contorna — é o gateway. A
 * rota equivalente das tarefas é `/api/task-attachment/[taskId]`; aqui o
 * isolamento é o mesmo, muda só quem autoriza a leitura (ADR-0024, item 9).
 *
 * Autorização derivada da sessão (nunca do id do cliente como escopo): o item é
 * da casa X; ADMIN precisa ser `ADMIN` de X, e qualquer **dependente** de X
 * pode abrir — o baú é material da casa, não de uma pessoa.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ itemId: string }> }
) {
  const { itemId } = await context.params

  const { user, profile } = await getSessionProfile()
  if (!user || !profile) {
    return new Response('Não autorizado', { status: 401 })
  }

  const admin = createAdminClient()
  const { data: item } = await admin
    .from('chest_items')
    .select('house_id, file_url, file_name, file_type')
    .eq('id', itemId)
    .maybeSingle()

  if (!item || item.file_type !== 'text/html') {
    // Nada a servir: item inexistente, ou o arquivo não é HTML (esses vão pela
    // URL pública) — 404 para não revelar a existência do item.
    return new Response('Arquivo não encontrado', { status: 404 })
  }

  // Membro da casa do item — a mesma checagem que a policy de SELECT faz, mas
  // aqui em service-role (é o canal que serve conteúdo).
  const { data: member } = await admin
    .from('house_members')
    .select('id')
    .eq('house_id', item.house_id)
    .eq('profile_id', user.id)
    .maybeSingle()

  if (!member) return new Response('Não autorizado', { status: 403 })

  const file = await fetch(item.file_url, { cache: 'no-store' })
  if (!file.ok || !file.body) {
    return new Response('Arquivo indisponível', { status: 404 })
  }

  const fileName = (item.file_name ?? 'pagina.html').replace(/["\r\n]/g, '')

  return new Response(file.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Só o `sandbox` (mais `allow-scripts` para o JS da página funcionar).
      // Sem `allow-same-origin`, o documento roda numa **origem opaca**: não lê
      // cookies nem `localStorage` e não navega a aba que o abriu. Sem
      // `default-src` de propósito: num documento sandboxed o `'self'` passa a
      // ser a origem opaca e bloquearia até as imagens relativas da página.
      'Content-Security-Policy': 'sandbox allow-scripts',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `inline; filename="${fileName}"`,
      // Conteúdo por usuário: nunca no cache do navegador nem do CDN.
      'Cache-Control': 'private, no-store, max-age=0',
    },
  })
}
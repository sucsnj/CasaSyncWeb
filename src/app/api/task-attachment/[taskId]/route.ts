import { createAdminClient } from '@/utils/supabase/admin'
import { getSessionProfile } from '@/utils/house'

/**
 * Serve o **anexo HTML** de uma tarefa — o único tipo que precisa passar por
 * aqui. Imagem, vídeo e PDF continuam abrindo direto pela URL pública do storage
 * (o Supabase entrega o content-type correto para eles).
 *
 * **Por que o HTML não abre pela URL pública:** o Supabase Storage força
 * `Content-Type: text/plain` em qualquer `text/html` — é uma mitigação
 * deliberada de XSS ("For security, HTML files are returned as plain text", na
 * documentação de Storage; ver supabase/storage#186, fechado como by-design). Com
 * `text/plain` + `X-Content-Type-Options: nosniff`, o browser mostra o **código**
 * da página em vez de renderizar. Nenhum content-type no upload, re-upload ou
 * configuração do bucket contorna — é o gateway.
 *
 * Esta rota devolve os bytes com o content-type certo e uma **CSP `sandbox`**:
 * a página renderiza (estilos e scripts funcionam) mas roda numa **origem
 * opaca** — sem acesso a cookies, `localStorage` ou ao app, e sem poder
 * navegar o topo. Isso é o mesmo isolamento que o próprio Supabase aplica; sem
 * ele, um HTML anexado rodaria com a origem do app.
 *
 * Autorização (padrão do projeto, derivada da sessão): ADMIN precisa ser membro
 * ADMIN da casa da tarefa; DEPENDENT só acessa a própria tarefa
 * (`assigned_to`). O id da tarefa vem do parâmetro de rota — nunca do cliente
 * como fonte de escopo sem checagem.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await context.params

  const { user, profile } = await getSessionProfile()
  if (!user || !profile) {
    return new Response('Não autorizado', { status: 401 })
  }

  const admin = createAdminClient()
  const { data: task } = await admin
    .from('tasks')
    .select('house_id, assigned_to, image_url, attachment_name, attachment_type')
    .eq('id', taskId)
    .maybeSingle()

  if (!task?.image_url || task.attachment_type !== 'text/html') {
    // Nada a servir: sem anexo, ou o anexo não é HTML (esses vão pela URL
    // pública) — 404 para não revelar a existência da tarefa.
    return new Response('Anexo não encontrado', { status: 404 })
  }

  if (profile.user_role === 'ADMIN') {
    const { data: member } = await admin
      .from('house_members')
      .select('id')
      .eq('house_id', task.house_id)
      .eq('profile_id', user.id)
      .eq('role', 'ADMIN')
      .maybeSingle()

    if (!member) return new Response('Não autorizado', { status: 403 })
  } else if (task.assigned_to !== user.id) {
    return new Response('Não autorizado', { status: 403 })
  }

  const file = await fetch(task.image_url, { cache: 'no-store' })
  if (!file.ok || !file.body) {
    return new Response('Anexo indisponível', { status: 404 })
  }

  const fileName = (task.attachment_name ?? 'anexo.html').replace(
    /["\r\n]/g,
    ''
  )

  return new Response(file.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Só o `sandbox` (mais `allow-scripts` para o JS da página funcionar).
      // Sem `allow-same-origin`, o documento roda numa **origem opaca**: não lê
      // cookies nem `localStorage`, e não consegue navegar a aba que o abriu.
      // É o mesmo isolamento que o Supabase aplica — mas aqui com o tipo certo.
      //
      // **Por que não há `default-src`/`img-src`:** num documento sandboxed o
      // `'self'` passa a ser a origem opaca e deixa de casar com a URL do
      // próprio documento — um `img-src 'self'` bloquearia até as imagens
      // relativas da página. A restrição que importa aqui é o sandbox, não o
      // CSP de recursos.
      'Content-Security-Policy': 'sandbox allow-scripts',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `inline; filename="${fileName}"`,
      // Conteúdo por usuário: nunca no cache do navegador nem do CDN.
      'Cache-Control': 'private, no-store, max-age=0',
    },
  })
}
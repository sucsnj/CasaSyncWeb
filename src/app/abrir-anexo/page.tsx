import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSessionProfile } from '@/utils/house'
import { loadHtmlAttachment, type HtmlAttachmentKind } from '@/utils/attachment-html'
import { OpenHtmlAttachment } from '@/components/attachments/open-html-attachment'

export const metadata: Metadata = {
  title: 'Abrir anexo',
}

export const dynamic = 'force-dynamic'

/**
 * AVISO ANTES DE ABRIR UM ANEXO HTML (ADR-0025).
 *
 * **Por que existe:** a página é servida em origem opaca (`CSP: sandbox
 * allow-scripts`), então um script dentro dela **não** alcança a conta de quem
 * abre — não lê cookie, não vê `localStorage`, não mexe no app. O que ela pode
 * fazer é **exibir qualquer coisa** e falar com a internet. O risco residual é,
 * então, o dependente encontrar uma **tela falsa de login** numa aba cuja barra
 * de endereço mostra o domínio do CasaSync.
 *
 * Esta tela existe para isso não passar de surpresa: antes do arquivo, aparece um
 * aviso **do próprio app**, em linguagem direta, dizendo de quem o material veio
 * e que senha não se digita ali. A mesma ideia que o Gmail e o Google Docs usam
 * com anexo HTML.
 *
 * **O que ela NÃO é:** não é fronteira de autorização. Quem souber a URL crua
 * (`/api/task-attachment/...`) pula o aviso — e pode, porque o aviso é sobre
 * confiança, não sobre permissão. A autorização real está em
 * `loadHtmlAttachment` e é a mesma das rotas de API.
 *
 * **Por que fica fora do grupo `(app)`:** é tela de segurança, não tela do app.
 * Sem a nav fica óbvio que o contexto mudou (e o shell custaria as leituras de
 * sino/castigo/comunicados sem servir para nada aqui).
 */
export default async function AbrirAnexoPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; id?: string }>
}) {
  const { kind, id } = await searchParams

  const { user } = await getSessionProfile()
  if (!user) redirect('/login')

  const parsedKind: HtmlAttachmentKind | null =
    kind === 'task' ? 'task' : kind === 'chest' ? 'chest' : null

  // `meta: true` só aqui: a tela mostra quem enviou e de que casa veio, e são 2
  // leituras a mais — que as rotas de API não pagariam à toa.
  const result =
    parsedKind && typeof id === 'string' && id
      ? await loadHtmlAttachment(parsedKind, id, { meta: true })
      : null

  const backHref = parsedKind === 'chest' ? '/chest' : '/tasks'

  if (!result?.ok) {
    return (
      <main className="flex min-h-svh flex-col bg-slate-900">
        <ExternalBanner />
        <div className="flex flex-1 items-center justify-center px-4 py-10">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-xl">
            <p className="text-lg font-bold text-slate-800">
              Material não está mais disponível
            </p>
            <p className="mt-2 text-sm text-slate-500">
              O arquivo pode ter sido removido, ou você não tem acesso a ele.
            </p>
            <Link
              href={backHref}
              className="mt-5 inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              Voltar para o App
            </Link>
          </div>
        </div>
      </main>
    )
  }

  const { info } = result
  const sender = info.senderName ?? 'seu tutor'

  return (
    <main className="flex min-h-svh flex-col bg-slate-900">
      <ExternalBanner />

      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="flex w-full max-w-md flex-col gap-5 rounded-2xl bg-white p-6 text-center shadow-xl">
          <div className="flex flex-col gap-2">
            <p className="text-3xl" aria-hidden>
              ✋
            </p>
            <h1 className="font-heading text-2xl font-black tracking-tight text-slate-900">
              Atenção!
            </h1>
            <p className="text-base font-medium text-slate-700">
              Você está prestes a abrir um arquivo enviado por{' '}
              <strong className="font-bold text-slate-900">{sender}</strong>
              {info.houseName ? `, da casa ${info.houseName}` : ''}.
            </p>
          </div>

          <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4 text-left">
            <p className="text-sm font-black uppercase tracking-wide text-red-700">
              🚨 Regra importante
            </p>
            <p className="mt-1 text-base font-semibold text-red-900">
              Nunca digite sua senha ou dados do CasaSync dentro desta página.
            </p>
          </div>

          <div className="text-left text-xs text-slate-500">
            <p>
              Arquivo: <span className="font-medium text-slate-700">{info.fileName}</span>
            </p>
            <p>
              Material:{' '}
              <span className="font-medium text-slate-700">{info.title}</span>
            </p>
          </div>

          <OpenHtmlAttachment href={info.href} backHref={backHref} />
        </div>
      </div>
    </main>
  )
}

/**
 * Faixa no topo: o aviso visual de que **saiu do CasaSync**. Ela é a primeira
 * coisa que a criança vê, e é o que diferencia esta tela de qualquer outra do app
 * (que é sempre azul/cinza claro).
 */
function ExternalBanner() {
  return (
    <div className="bg-amber-400 px-4 py-3 text-center">
      <p className="text-sm font-black uppercase tracking-wide text-slate-900">
        Conteúdo Externo do Tutor
      </p>
    </div>
  )
}
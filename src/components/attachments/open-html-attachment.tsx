'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

/** Janela de fricção antes de liberar o botão (ADR-0025). */
const COUNTDOWN_SECONDS = 3

/**
 * Ação de abrir o anexo HTML, com **fricção proposital** (ADR-0025).
 *
 * A ideia é quebrar o **reflexo**: criança clica no primeiro botão que vê, sem
 * ler. Então o botão só existe depois de alguns segundos — e, mesmo depois, exige
 * uma marcação de que entendeu a regra. Um checkbox sozinho não resolveria: é
 * **um clique**, ou seja, só deslocaria o reflexo em vez de quebrá-lo.
 *
 * `href` é a rota crua que serve o arquivo (`/api/task-attachment/...` ou
 * `/api/chest-item/...`), que revalida a sessão e a autorização de novo — o aviso
 * é sobre confiança, não sobre permissão.
 */
export function OpenHtmlAttachment({
  href,
  backHref,
}: {
  href: string
  /** Para onde fica o botão de voltar: a tela de onde o material veio. */
  backHref: string
}) {
  const [seconds, setSeconds] = useState(COUNTDOWN_SECONDS)
  const [understood, setUnderstood] = useState(false)

  useEffect(() => {
    if (seconds <= 0) return
    const timer = setTimeout(() => setSeconds((value) => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [seconds])

  const ready = seconds <= 0 && understood

  return (
    <div className="flex flex-col gap-4">
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left">
        <input
          type="checkbox"
          checked={understood}
          onChange={(event) => setUnderstood(event.target.checked)}
          className="mt-0.5 size-5 shrink-0 accent-blue-600"
        />
        <span className="text-sm font-medium text-slate-700">
          Entendi que não devo digitar minha senha.
        </span>
      </label>

      {/* `aria-live` para a contagem ser anunciada: o rótulo muda sozinho e o
          botão começa desabilitado — sem isso, leitor de tela não contaria nada. */}
      <div aria-live="polite">
        {ready ? (
          <Button asChild className="w-full">
            <a href={href}>🔵 Abrir Arquivo</a>
          </Button>
        ) : (
          <Button disabled className="w-full">
            {seconds > 0 ? `Aguarde ${seconds}s…` : 'Marque a caixinha acima'}
          </Button>
        )}
      </div>

      <Link
        href={backHref}
        className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 active:scale-95"
      >
        Voltar para o App
      </Link>
    </div>
  )
}
/**
 * Instrumentação de latência **TEMPORÁRIA** — criado para medir o caminho de
 * render antes de decidir o Tier 2 da investigação de navegação (ver a seção
 * "Navegação entre telas" do `PROJECT_STATUS.md`).
 *
 * **Uma linha por bloco**, no formato `[PERF] <label>: <ms>ms`, para filtrar com
 * `[PERF]` nos Function Logs da Vercel.
 *
 * ## Como desligar
 * Definir `PERF_LOG=0` no ambiente (Vercel → Settings → Environment Variables).
 * O default é **ligado**, porque o objetivo é medir sem passo extra.
 *
 * ## Quando remover
 * Assim que o Tier 2 estiver decidido (ou descartado), apagar este arquivo e as
 * chamadas `timeServer(...)` — são 5, todas em utilitários compartilhados, listadas
 * na seção do `PROJECT_STATUS.md`. Nada de comportamento depende disto: o helper
 * só mede e registra, e com `PERF_LOG=0` ele nem mede.
 */

/** `PERF_LOG=0` desliga. Lido por chamada (e não no topo do módulo) para o
 *  interruptor valer mesmo com a env definida depois do primeiro import. */
function enabled(): boolean {
  return process.env.PERF_LOG !== '0'
}

/**
 * Mede e registra o tempo de um bloco assíncrono, sem alterar o resultado.
 *
 * Aceita `PromiseLike` de propósito: os builders do `supabase-js` são *thenables*
 * (`PostgrestFilterBuilder`), não `Promise` — se a assinatura exigisse `Promise<T>`
 * o `T` sairia como `unknown` e o typecheck quebraria em cada chamada.
 *
 * Loga no `finally`, então o tempo aparece mesmo quando o bloco lança — nesse caso
 * a linha deixa de ser um número de latência e passa a ser um mapa de onde a
 * exceção veio.
 */
export async function timeServer<T>(
  label: string,
  fn: () => PromiseLike<T> | Promise<T>
): Promise<T> {
  if (!enabled()) return await fn()

  const started = performance.now()
  try {
    return await fn()
  } finally {
    console.log(`[PERF] ${label}: ${Math.round(performance.now() - started)}ms`)
  }
}
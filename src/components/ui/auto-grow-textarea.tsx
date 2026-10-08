'use client'

import * as React from 'react'

/**
 * `useLayoutEffect` no servidor não faz nada (e o React avisa no console), mas
 * aqui o ajuste precisa acontecer ANTES do paint — senão o textarea pisca na
 * altura antiga e depois salta. Daí a variante isomórfica: layout no cliente,
 * effect no servidor.
 */
const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect

export type AutoGrowTextareaProps = React.ComponentProps<'textarea'>

/**
 * Textarea que **cresce sozinho** até o texto caber inteiro, sem o usuário ter
 * que arrastar a alça.
 *
 * A **manipulação manual continua disponível**: o `resize-y` fica no className
 * do call site, e se o usuário arrastar para uma altura MAIOR que o texto, essa
 * altura vira o piso — o auto-grow cresce sozinho, mas nunca encolhe o campo
 * debaixo dos dedos de quem o arrastou. (Encolher manualmente abaixo do texto
 * não é preservado de propósito: o requisito é o bloco sempre caber o conteúdo.)
 *
 * Implementação:
 * - a medição volta a `auto` antes de ler (e soma a borda, que o
 *   `scrollHeight` não inclui) — está comentado na linha do `grow()`;
 * - um `ResizeObserver` refaz a conta quando muda a **largura** (card
 *   colapsado, tela girada, outra coluna do grid) — só largura, porque reagir
 *   à própria altura criaria um laço com o observer;
 * - a distinção entre arrasto e clique é o `offsetHeight` no `pointerup`, e
 *   só quando o campo ficou MAIOR do que aplicamos (ver o comentário do handler).
 */
function AutoGrowTextarea({
  ref,
  onPointerUp,
  ...props
}: AutoGrowTextareaProps) {
  const innerRef = React.useRef<HTMLTextAreaElement | null>(null)
  const manualHeightRef = React.useRef(0)
  const appliedHeightRef = React.useRef(0)

  // Repassa o ref para fora (foco automático, p.ex.) e o usa por dentro.
  const setRef = (node: HTMLTextAreaElement | null) => {
    innerRef.current = node
    if (typeof ref === 'function') ref(node)
    else if (ref) (ref as React.RefObject<HTMLTextAreaElement | null>).current = node
  }

  const grow = React.useCallback(() => {
    const el = innerRef.current
    if (!el) return
    // Medir exige voltar a `auto` primeiro, senão `scrollHeight` devolveria a
    // altura que acabamos de aplicar e o campo nunca cresceria. Com `auto` o
    // textarea volta ao mínimo do `rows`, o que preserva o piso visual.
    el.style.height = 'auto'
    // `scrollHeight` é conteúdo + padding, **sem** a borda; e o Tailwind
    // preflight põe `box-sizing: border-box` em tudo, então a altura precisa
    // somar a borda — sem isso a última linha ficaria cortada em ~1px.
    // `offsetHeight - clientHeight` é a soma das bordas, sem `getComputedStyle`.
    const borders = el.offsetHeight - el.clientHeight
    const needed = el.scrollHeight + borders
    const next = Math.max(needed, manualHeightRef.current)
    el.style.height = `${next}px`
    appliedHeightRef.current = next
  }, [])

  // Sem array de dependências de propósito: o textarea é controlado, então cada
  // tecla já chega com o texto novo e a altura tem que acompanhar o render.
  useIsomorphicLayoutEffect(grow)

  React.useEffect(() => {
    const el = innerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    let lastWidth = el.offsetWidth
    const observer = new ResizeObserver(() => {
      const width = el.offsetWidth
      if (width === lastWidth) return
      lastWidth = width
      grow()
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [grow])

  function handlePointerUp(event: React.PointerEvent<HTMLTextAreaElement>) {
    const el = innerRef.current
    if (el && el.offsetHeight > appliedHeightRef.current + 1) {
      // Só interessa o caso em que o campo ficou MAIOR: esse é o piso que o
      // auto-grow não pode desfazer. Um `min-height` de CSS (o `min-h-12` do
      // card) também aumenta o `offsetHeight` sem ser arrasto — por isso a
      // comparação, e não um "diferente do aplicado".
      manualHeightRef.current = el.offsetHeight
    }
    onPointerUp?.(event)
  }

  return <textarea {...props} ref={setRef} onPointerUp={handlePointerUp} />
}

export { AutoGrowTextarea }
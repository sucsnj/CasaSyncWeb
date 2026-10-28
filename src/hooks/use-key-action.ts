import { useEffect, useRef } from 'react'

export type KeyAction = (event: KeyboardEvent) => void

export type UseKeyActionOptions = {
  /** Desliga o listener sem desmontar o componente. Padrão: true. */
  enabled?: boolean
  /** Chama `preventDefault()` antes da ação. Padrão: false. */
  preventDefault?: boolean
  /** Alvo do listener. Padrão: `document` (client). */
  target?: EventTarget | null
}

/**
 * Dispara `action` se `event.key` estiver em `key`. Retorna true quando acionou.
 * Aceita tanto `KeyboardEvent` nativo quanto `React.KeyboardEvent`.
 * A tecla e a ação são definidas na chamada.
 */
export function triggerOnKey<E extends { key: string; preventDefault(): void }>(
  event: E,
  key: string | string[],
  action: (event: E) => void,
  preventDefault = false
): boolean {
  const keys = Array.isArray(key) ? key : [key]
  if (!keys.includes(event.key)) return false
  if (preventDefault) event.preventDefault()
  action(event)
  return true
}

/**
 * Helper genérico de acionamento por tecla: dispara `action` quando a tecla
 * (ou uma das teclas) informada em `key` é pressionada. A tecla e a ação
 * são definidas na chamada — o helper não fixa nenhuma tecla específica.
 */
export function useKeyAction(
  key: string | string[],
  action: KeyAction,
  options: UseKeyActionOptions = {}
): void {
  const { enabled = true, preventDefault = false, target = null } = options

  const actionRef = useRef<KeyAction>(action)
  const keysRef = useRef<string[]>(Array.isArray(key) ? key : [key])
  const targetRef = useRef<EventTarget | null>(target)

  // Sincroniza refs em effects (evita acesso a ref durante render).
  useEffect(() => {
    actionRef.current = action
  }, [action])

  useEffect(() => {
    keysRef.current = Array.isArray(key) ? key : [key]
  }, [key])

  useEffect(() => {
    targetRef.current = target
  }, [target])

  useEffect(() => {
    if (!enabled) return
    const attachTo =
      typeof document !== 'undefined' ? document : null
    if (!attachTo) return

    const handler = (event: Event) => {
      const keyboardEvent = event as KeyboardEvent
      if (!keysRef.current.includes(keyboardEvent.key)) return
      // Alvo específico: filtra por contenção.
      if (targetRef.current) {
        const t = targetRef.current as Node
        if (
          event.target instanceof Node &&
          event.target !== targetRef.current &&
          !t.contains(event.target)
        ) {
          return
        }
      }
      if (preventDefault) keyboardEvent.preventDefault()
      actionRef.current(keyboardEvent)
    }

    attachTo.addEventListener('keydown', handler)
    return () => attachTo.removeEventListener('keydown', handler)
  }, [enabled, preventDefault])
}

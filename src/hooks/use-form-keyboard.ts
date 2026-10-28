import { useKeyAction } from '@/hooks/use-key-action'

export type UseFormKeyboardOptions = {
  /** Ação de confirmação (ex.: submit do form). Acionada por Enter. */
  onConfirm?: () => void
  /** Ação de cancelamento. Acionada por Escape. */
  onCancel?: () => void
  /** Liga/desliga os atalhos. Padrão: true. */
  enabled?: boolean
}

/**
 * Atalhos de teclado para formulários/modais: Enter confirma, Escape cancela.
 * Usa o helper genérico `useKeyAction` — a tecla e a ação são definidas aqui.
 */
export function useFormKeyboard(options: UseFormKeyboardOptions = {}): void {
  const { onConfirm, onCancel, enabled = true } = options

  useKeyAction('Enter', () => {
    const active = document.activeElement
    // Se o foco está em um botão/link/campo, deixa o comportamento nativo
    // (evita disparar confirmar quando o usuário está sobre "Cancelar").
    if (
      active instanceof HTMLButtonElement ||
      active instanceof HTMLAnchorElement ||
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement ||
      active instanceof HTMLSelectElement
    ) {
      return
    }
    onConfirm?.()
  }, { enabled: enabled && Boolean(onConfirm), preventDefault: true })

  useKeyAction('Escape', () => {
    onCancel?.()
  }, { enabled: enabled && Boolean(onCancel) })
}

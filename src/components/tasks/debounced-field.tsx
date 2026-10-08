'use client'

import { useEffect, useRef, useState } from 'react'
import type { ActionResult } from '@/actions/types'
import { AutoGrowTextarea } from '@/components/ui/auto-grow-textarea'

/**
 * Quanto tempo "✓ Alterações salvas" fica visível antes do botão de ação do
 * card voltar (é o que esconde o botão enquanto a edição está em curso).
 *
 * Curto de propósito: o salvamento é rápido e o ADMIN não deve ficar impedido
 * de aprovar a tarefa por causa de um texto na tela. Era 30s, o que só fazia
 * sentido com o salvamento lento do passado.
 */
const SAVED_FEEDBACK_MS = 5000

/**
 * Ele deve expor o callback de estado de salvamento
 * onSavingStatusChange('saving' | 'saved' | 'idle')
 * para notificar o componente pai quando o usuário estiver digitando ou focando no campo.
 */

type DebouncedFieldProps = {
  value: string
  onSave: (value: string) => Promise<ActionResult>
  debounceMs?: number
  textarea?: boolean
  type?: string
  placeholder?: string
  className?: string
  onSavingStatusChange?: (status: 'saving' | 'saved' | 'idle') => void
}

/**
 * Campo com salvamento automático (debounce).
 *
 * ENSINO (teach): ao digitar, NADA é enviado ainda. Só depois de `debounceMs`
 * de inatividade o valor é persistido via Server Action. Isso evita uma
 * chamada por tecla (custo/ruído) mantendo UX de "saves silenciosos".
 * O `onBlur` força flush imediato para não perder a última edição.
 */
export function DebouncedField({
  value,
  onSave,
  debounceMs = 900,
  textarea = false,
  type = 'text',
  placeholder,
  className,
  onSavingStatusChange,
}: DebouncedFieldProps) {
  const [local, setLocal] = useState(value)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const focusedRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Timer do "voltar para idle" após o feedback de salvo. Precisa da ref porque
  // o anterior tem de ser CANCELADO: com a janela curta de
  // `SAVED_FEEDBACK_MS`, uma edição logo após outra deixaria o timer velho
  // derrubar o feedback do salvamento novo (o debounce já tem o `timerRef`).
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  function handleSavingStatusChange(status: 'saving' | 'saved' | 'idle') {
    onSavingStatusChange?.(status)
  }

  // Sincroniza quando a fonte externa muda (Realtime / revalidação) e o
  // campo NÃO está em foco — evita sobrescrever o que o usuário digita.
  useEffect(() => {
    if (!focusedRef.current && value !== local) {
      setLocal(value)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (timerRef.current) clearTimeout(timerRef.current)
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    }
  }, [])

  async function runSave(next: string) {
    handleSavingStatusChange('saving')
    setSaving(true)
    const result = await onSave(next)
    if (!mountedRef.current) return
    setSaving(false)
    if (!result.ok) {
      setError(result.error)
      handleSavingStatusChange('idle')
      return
    }
    handleSavingStatusChange('saved')

    // Janela curta (5s) para o ADMIN ler "Alterações salvas" antes do botão de
    // ação voltar. O timer anterior é cancelado: sem isso, retocar o campo logo
    // em seguida deixaria o timer velho derrubar o feedback do salvamento novo.
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    savedTimerRef.current = setTimeout(() => {
      handleSavingStatusChange('idle')
    }, SAVED_FEEDBACK_MS)
  }

  function schedule(next: string) {
    handleSavingStatusChange('idle')
    setError(null)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      void runSave(next)
    }, debounceMs)
  }

  function handleBlur() {
    focusedRef.current = false
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
      void runSave(local)
    }
  }

  const controlClass = `min-h-12 w-full min-w-0 rounded-xl border border-input bg-white px-3 py-2 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 md:text-sm dark:bg-input/30 ${className ?? ''}`

  return (
    <div className="flex flex-col gap-1">
      {textarea ? (
        <AutoGrowTextarea
          value={local}
          placeholder={placeholder}
          onFocus={() => {
            focusedRef.current = true
          }}
          onChange={(event) => {
            setLocal(event.target.value)
            schedule(event.target.value)
          }}
          onBlur={handleBlur}
          rows={2}
          className={`${controlClass} h-auto resize-y py-1.5`}
        />
      ) : (
        <input
          type={type}
          value={local}
          placeholder={placeholder}
          onFocus={() => {
            focusedRef.current = true
          }}
          onChange={(event) => {
            setLocal(event.target.value)
            schedule(event.target.value)
          }}
          onBlur={handleBlur}
          className={controlClass}
        />
      )}

      {saving ? (
        <span className="text-xs text-muted-foreground">salvando…</span>
      ) : null}
      {error ? (
        <span className="text-xs text-destructive" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  )
}
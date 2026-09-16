'use client'

import { useEffect, useRef, useState } from 'react'
import type { ActionResult } from '@/actions/types'

type DebouncedFieldProps = {
  value: string
  onSave: (value: string) => Promise<ActionResult>
  debounceMs?: number
  textarea?: boolean
  type?: string
  placeholder?: string
  className?: string
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
}: DebouncedFieldProps) {
  const [local, setLocal] = useState(value)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const focusedRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

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
    }
  }, [])

  async function runSave(next: string) {
    setSaving(true)
    const result = await onSave(next)
    if (!mountedRef.current) return
    setSaving(false)
    if (!result.ok) setError(result.error)
  }

  function schedule(next: string) {
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

  const controlClass = `h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 md:text-sm dark:bg-input/30 ${className ?? ''}`

  return (
    <div className="flex flex-col gap-1">
      {textarea ? (
        <textarea
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
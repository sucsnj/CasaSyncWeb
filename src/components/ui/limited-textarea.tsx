'use client'

import * as React from 'react'
import { AutoGrowTextarea } from '@/components/ui/auto-grow-textarea'
import { cn } from '@/lib/utils'
import { countTextChars, textLimitLabel } from '@/utils/text-limits'

/**
 * Contador vivo de caracteres. `limit <= 0` = sem limite (mostra a contagem sem
 * teto). Muda de cor perto do teto e no estouro — o `maxLength` do campo impede
 * passar, mas texto colado de outra origem pode vir acima.
 */
export function CharCounter({
  value,
  limit,
}: {
  value: string
  limit: number
}) {
  const count = countTextChars(value)
  const unlimited = limit <= 0
  const tone = unlimited
    ? 'text-slate-500'
    : count > limit
      ? 'text-red-600'
      : count > limit * 0.9
        ? 'text-amber-600'
        : 'text-slate-500'

  return (
    <p className={cn('text-xs', tone)}>
      {unlimited
        ? `${count} caracteres (sem limite)`
        : `${count} de ${textLimitLabel(limit)}`}
    </p>
  )
}

export type LimitedTextareaProps = React.ComponentProps<'textarea'> & {
  /** Teto em caracteres; `0` = sem limite (some o `maxLength`). */
  limit: number
}

/**
 * Textarea com teto de caracteres e contador embaixo.
 *
 * Funciona **controlado** (`value` + `onChange`) e **não controlado**
 * (`defaultValue`, lendo o evento `input` só para o contador) — é o mesmo
 * desenho do `ClearableInput`, então o campo serve para os dois formulários do
 * app sem trocar a forma de ler o valor (`FormData` ou estado).
 *
 * O limite vem da casa (chave `text_limits`) e é uma dupla checagem: o
 * `maxLength` dá o feedback imediato, e o servidor (`checkTextLimit`) é quem
 * vale — cliente é só conveniência.
 */
export function LimitedTextarea({
  limit,
  value,
  defaultValue,
  onChange,
  rows = 2,
  className,
  ...props
}: LimitedTextareaProps) {
  const controlled = typeof value === 'string'
  // Estado só para o contador no modo não controlado; no controlado o valor já
  // vem do pai. `String()` porque `value` do DOM aceita number/array e o estado
  // guarda texto.
  const [internal, setInternal] = React.useState(() => String(defaultValue ?? ''))
  const current = controlled ? String(value) : internal

  return (
    <div className="flex flex-col gap-1">
      <AutoGrowTextarea
        {...props}
        rows={rows}
        value={value}
        defaultValue={defaultValue}
        maxLength={limit > 0 ? limit : undefined}
        onChange={onChange}
        onInput={(event) => {
          if (!controlled) setInternal(event.currentTarget.value)
          props.onInput?.(event)
        }}
        className={cn('resize-y', className)}
      />
      <CharCounter value={current} limit={limit} />
    </div>
  )
}
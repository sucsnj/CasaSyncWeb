'use client'

import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from "cn"
import { Input } from "./input"

export type ClearableInputProps = React.ComponentProps<typeof Input> & {
  /**
   * Limpa o campo. Sem este callback o botão esvazia o campo sozinho: em input
   * controlado dispara o `onChange` com valor vazio (todo input controlado do
   * app lê só `event.target.value`); em input sem `value` limpa o DOM e avisa o
   * React com um evento `input`.
   */
  onClear?: () => void
}

/**
 * Input com um **X no fim** para apagar o que foi digitado em um clique (sem
 * selecionar tudo e apagar). O botão só aparece com conteúdo e devolve o foco
 * ao campo, para continuar digitando.
 *
 * Funciona em input **controlado** (`value` + `onChange`) e **não controlado**
 * (formulários que leem `FormData`) — o `onInput` interno só existe no segundo
 * caso, para o X aparecer e sumir junto com o texto.
 *
 * Aplicado onde apagar rápido importa: buscas, títulos de formulário e campos
 * de identificação (nome, usuário, PIN da casa). Não se aplica a numéricos,
 * data/hora, senha e textarea — lá o `type`/o botão já fazem esse papel.
 */
function ClearableInput({
  value,
  onChange,
  onClear,
  className,
  ref,
  ...props
}: ClearableInputProps) {
  const innerRef = React.useRef<HTMLInputElement | null>(null)
  const controlled = typeof value === 'string'
  // Input não controlado: o estado nasce do `defaultValue` (campo já
  // preenchido) e passa a ser o `onInput` — o X aparece junto com o texto.
  const [domValue, setDomValue] = React.useState(() => {
    const initial = (props as { defaultValue?: string | number }).defaultValue
    return initial === undefined ? '' : String(initial)
  })
  const currentValue = controlled ? (value as string) : domValue
  const hasValue = currentValue.length > 0

  // Repassa o ref para fora (foco automático, p.ex.) e o usa por dentro.
  const setRef = (node: HTMLInputElement | null) => {
    innerRef.current = node
    if (typeof ref === 'function') ref(node)
    else if (ref) (ref as React.RefObject<HTMLInputElement | null>).current = node
  }

  function handleClear() {
    if (onClear) {
      onClear()
    } else if (controlled) {
      onChange?.({ target: { value: '' } } as React.ChangeEvent<HTMLInputElement>)
    } else if (innerRef.current) {
      innerRef.current.value = ''
      setDomValue('')
      innerRef.current.dispatchEvent(new Event('input', { bubbles: true }))
    }
    innerRef.current?.focus()
  }

  return (
    <div className="relative">
      <Input
        {...props}
        ref={setRef}
        value={value}
        onChange={onChange}
        onInput={
          controlled
            ? undefined
            : (event) => setDomValue(event.currentTarget.value)
        }
        className={cn(hasValue && 'pr-11', className)}
      />
      {hasValue ? (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Limpar campo"
          title="Limpar"
          className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 active:scale-95"
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  )
}

export { ClearableInput }

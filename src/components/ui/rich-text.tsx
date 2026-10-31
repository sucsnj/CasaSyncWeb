import { Fragment, type ReactNode } from 'react'

const TOKEN_RE =
  /(\*[^*\n]+\*|_[^_\n]+_|-[^-\n]+-|`[^`\n]+`|&[1-4][^&\n]*?&)/g

const COLOR_CLASS: Record<string, string> = {
  '1': 'text-red-600',
  '2': 'text-green-600',
  '3': 'text-blue-600',
  '4': 'text-amber-600',
}

/**
 * Converte a marcação leve de descrições em nós React:
 *   *negrito*  _sublinhado_  -cortado-  `tabular/monoespaçado`
 *   &1vermelho& &2verde& &3azul& &4amarelo&
 */
export function parseRichText(text: string): ReactNode[] {
  return text.split(TOKEN_RE).map((part, index) => {
    if (part.length >= 3 && part.startsWith('*') && part.endsWith('*')) {
      return <strong key={index}>{part.slice(1, -1)}</strong>
    }
    if (part.length >= 3 && part.startsWith('_') && part.endsWith('_')) {
      return <u key={index}>{part.slice(1, -1)}</u>
    }
    if (part.length >= 3 && part.startsWith('-') && part.endsWith('-')) {
      return <s key={index}>{part.slice(1, -1)}</s>
    }
    if (part.length >= 3 && part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={index}
          className="rounded bg-slate-100 px-1 font-mono text-[0.9em]"
        >
          {part.slice(1, -1)}
        </code>
      )
    }
    const colorMatch = part.match(/^&([1-4])([^&]*)&$/)
    if (colorMatch) {
      return (
        <span key={index} className={COLOR_CLASS[colorMatch[1]]}>
          {colorMatch[2]}
        </span>
      )
    }
    return <Fragment key={index}>{part}</Fragment>
  })
}

export function RichText({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  return <span className={className}>{parseRichText(text)}</span>
}

'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { countTextChars, textLimitLabel } from '@/utils/text-limits'


export type RichTextEditorProps = Omit<React.ComponentProps<'div'>, 'onChange'> & {
  /** Valor controlado (texto com marcação). */
  value?: string
  /** Valor inicial (não controlado). */
  defaultValue?: string
  /** Chamado com o texto (com marcação) ao editar. */
  onChange?: (value: string) => void
  /** Teto em caracteres; `0` = sem limite. */
  limit?: number
  /** Linhas visíveis (altura mínima). */
  rows?: number
  /** Nome do campo para envio em formulários (input oculto). */
  name?: string
  /** Texto de ajuda exibido quando vazio. */
  placeholder?: string
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Converte o texto com marcação em HTML, ocultando os caracteres especiais
 * (font-size 0) e aplicando a formatação. Quebras de linha viram <br>.
 */
const MARKER_STYLE = 'font-size:0;line-height:0;display:inline-block;overflow:hidden'

const COLOR: Record<string, string> = {
  '1': 'color:#dc2626',
  '2': 'color:#16a34a',
  '3': 'color:#2563eb',
  '4': 'color:#ca8a04',
}

function toHtml(text: string): string {
  const TOKEN_RE =
    /(\*[^*\n]+\*|_[^_\n]+_|-[^-\n]+-|`[^`\n]+`|&[1-4][^&\n]*?&)/g
  const parts = text.split(TOKEN_RE)
  let html = ''
  for (const part of parts) {
    if (part.length >= 3 && part.startsWith('*') && part.endsWith('*')) {
      html +=
        `<span style="${MARKER_STYLE}">*</span>` +
        `<strong>${escapeHtml(part.slice(1, -1))}</strong>` +
        `<span style="${MARKER_STYLE}">*</span>`
    } else if (part.length >= 3 && part.startsWith('_') && part.endsWith('_')) {
      html +=
        `<span style="${MARKER_STYLE}">_</span>` +
        `<u>${escapeHtml(part.slice(1, -1))}</u>` +
        `<span style="${MARKER_STYLE}">_</span>`
    } else if (part.length >= 3 && part.startsWith('-') && part.endsWith('-')) {
      html +=
        `<span style="${MARKER_STYLE}">-</span>` +
        `<s>${escapeHtml(part.slice(1, -1))}</s>` +
        `<span style="${MARKER_STYLE}">-</span>`
    } else if (part.length >= 3 && part.startsWith('`') && part.endsWith('`')) {
      html +=
        `<span style="${MARKER_STYLE}">\`</span>` +
        `<code style="background:#f1f5f9;padding:0 4px;border-radius:4px;font-family:monospace;font-size:0.9em">${escapeHtml(
          part.slice(1, -1)
        )}</code>` +
        `<span style="${MARKER_STYLE}">\`</span>`
    } else {
      const colorMatch = part.match(/^&([1-4])([^&]*)&$/)
      if (colorMatch) {
        html +=
          `<span style="${MARKER_STYLE}">${escapeHtml('&' + colorMatch[1])}</span>` +
          `<span style="${COLOR[colorMatch[1]]}">${escapeHtml(colorMatch[2])}</span>` +
          `<span style="${MARKER_STYLE}">${escapeHtml('&')}</span>`
      } else {
        html += escapeHtml(part).replace(/\n/g, '<br>')
      }
    }
  }
  return html || ''
}

function getCaretOffset(root: HTMLElement): number {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return 0
  const range = selection.getRangeAt(0)
  const preRange = range.cloneRange()
  preRange.selectNodeContents(root)
  preRange.setEnd(range.endContainer, range.endOffset)
  // Conta caracteres do textContent do preRange.
  return preRange.toString().length
}

function setCaretOffset(root: HTMLElement, offset: number) {
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  let remaining = offset
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null)
  let node = walker.nextNode() as Text | null
  while (node) {
    const len = node.textContent?.length ?? 0
    if (remaining <= len) {
      range.setStart(node, remaining)
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
      return
    }
    remaining -= len
    node = walker.nextNode() as Text | null
  }
  // Fallback: fim do conteúdo.
  range.selectNodeContents(root)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}

/**
 * Editor rico (contenteditable) com formatação ao vivo: os caracteres especiais
 * ficam invisíveis (font-size 0) mas permanecem no texto, podendo ser apagados.
 */
export function RichTextEditor({
  value,
  defaultValue,
  onChange,
  limit = 0,
  rows = 2,
  name,
  placeholder,
  className,
  ...props
}: RichTextEditorProps) {
  const controlled = typeof value === 'string'
  const [internal, setInternal] = React.useState(() => String(defaultValue ?? ''))
  const current = controlled ? String(value) : internal

  const ref = React.useRef<HTMLDivElement>(null)
  const composingRef = React.useRef(false)
  const lastHtmlRef = React.useRef<string>('')

  // Sincroniza o DOM quando o valor externo muda.
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    // Evita re-renderizar se o DOM já reflete o valor (evita perder o foco/caret).
    if ((el.textContent ?? '') === current) return
    const nextHtml = toHtml(current)
    if (el.innerHTML !== nextHtml) {
      const offset = getCaretOffset(el)
      el.innerHTML = nextHtml
      lastHtmlRef.current = nextHtml
      setCaretOffset(el, Math.min(offset, current.length))
    }
  }, [current])

  function handleInput() {
    const el = ref.current
    if (!el) return
    let text = el.textContent ?? ''
    if (limit > 0 && text.length > limit) {
      text = text.slice(0, limit)
    }
    const offset = getCaretOffset(el)
    const html = toHtml(text)
    if (el.innerHTML !== html) {
      el.innerHTML = html
      setCaretOffset(el, Math.min(offset, text.length))
    }
    if (controlled) {
      onChange?.(text)
    } else {
      setInternal(text)
      onChange?.(text)
    }
  }

  const minHeight = `${rows * 1.5}rem`

  return (
    <div className="flex flex-col gap-1">
      {name ? <input type="hidden" name={name} value={current} /> : null}
      <div className="relative">
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          onInput={handleInput}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            const selection = window.getSelection()
            if (!selection || selection.rangeCount === 0) return
            const range = selection.getRangeAt(0)
            const textNode = document.createTextNode('\n')
            range.deleteContents()
            range.insertNode(textNode)
            range.setStartAfter(textNode)
            range.collapse(true)
            selection.removeAllRanges()
            selection.addRange(range)
            handleInput()
          }
          props.onKeyDown?.(event)
        }}
        onCompositionStart={() => {
          composingRef.current = true
        }}
          onCompositionEnd={() => {
            composingRef.current = false
            handleInput()
          }}
          className={cn(
            'w-full rounded-xl border border-input bg-white px-3 py-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm',
            className
          )}
          style={{ minHeight, whiteSpace: 'pre-wrap' }}
          {...props}
        />
        {!current && placeholder ? (
          <span className="pointer-events-none absolute left-3 top-2 text-sm text-muted-foreground">
            {placeholder}
          </span>
        ) : null}
      </div>
      <p className="text-xs text-slate-500">
        {limit <= 0
          ? `${countTextChars(current)} caracteres (sem limite)`
          : `${countTextChars(current)} de ${textLimitLabel(limit)}`}
      </p>
    </div>
  )
}

'use client'

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function Modal({
  open,
  onClose,
  title,
  children,
  hideCloseButton = false,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  hideCloseButton?: boolean
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  // Mantém o onClose atual sem recriar o efeito (que só depende de `open`).
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return

    previousFocusRef.current = document.activeElement as HTMLElement | null

    // Trava o scroll do documento enquanto o modal está aberto.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function getFocusable(): HTMLElement[] {
      const root = panelRef.current
      if (!root) return []
      return Array.from(
        root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((el) => el.offsetParent !== null)
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return

      // Prende o Tab dentro da janela: sem isso, o foco "vaza" para os
      // elementos por trás (header/bottom nav) enquanto o modal está aberto.
      const focusable = getFocusable()
      if (focusable.length === 0) {
        event.preventDefault()
        panelRef.current?.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement as HTMLElement | null
      const index = active ? focusable.indexOf(active) : -1

      if (event.shiftKey) {
        if (index <= 0) {
          event.preventDefault()
          last.focus()
        }
      } else if (index === -1 || index === focusable.length - 1) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)

    panelRef.current?.focus()

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
      previousFocusRef.current?.focus?.()
    }
  }, [open])

  if (!open || typeof document === 'undefined') return null

  // Portal para o `body`: escapa do stacking context do header (azul, z-50,
  // `text-white`) — sem isso o modal herda a cor do header e a bottom nav
  // fica clicável por trás da janela.
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center text-slate-800 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label="Fechar"
        tabIndex={-1}
        className="absolute inset-0 cursor-default bg-slate-950/50"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative z-10 flex max-h-[88svh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl outline-none sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <p className="font-heading text-base font-semibold text-slate-800">
            {title}
          </p>
          {!hideCloseButton ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Fechar"
              className="min-h-10 px-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              onClick={onClose}
            >
              <X className="size-4" />
            </Button>
          ) : null}
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>,
    document.body
  )
}

'use client'

import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label="Fechar"
        className="absolute inset-0 bg-slate-950/50"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[88svh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <p className="font-heading text-base font-semibold text-slate-800">
            {title}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Fechar"
            className="min-h-10 px-2"
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  )
}
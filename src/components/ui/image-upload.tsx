'use client'

import { useState } from 'react'
import { ImagePlus, LoaderCircle, X } from 'lucide-react'
import { uploadMedia, type MediaFolder } from '@/utils/media'
import { cn } from '@/lib/utils'

export function ImageUpload({
  folder,
  ownerId,
  value,
  onChange,
  label = 'Enviar foto',
}: {
  folder: MediaFolder
  ownerId: string
  value?: string | null
  onChange: (url: string | null) => void
  label?: string
}) {
  const [uploading, setUploading] = useState(false)

  async function handleFile(file: File | undefined) {
    if (!file || uploading) return
    setUploading(true)
    try {
      const url = await uploadMedia(folder, file, ownerId)
      if (url) onChange(url)
    } catch {
      // upload falhou: mantém a URL atual (o form continua válido)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      {value ? (
        <span className="relative shrink-0">
          <img
            src={value}
            alt="Prévia"
            className="size-16 rounded-xl border border-slate-200 object-cover shadow-sm"
          />
          <button
            type="button"
            aria-label="Remover imagem"
            onClick={() => onChange(null)}
            className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-slate-900 text-slate-200 shadow-sm transition-transform active:scale-90"
          >
            <X className="size-3" />
          </button>
        </span>
      ) : (
        <span
          className={cn(
            'flex size-16 shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-400'
          )}
        >
          <ImagePlus className="size-6" />
        </span>
      )}

      <label
        className={cn(
          'inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition-all duration-200',
          'hover:bg-slate-50 active:scale-95 disabled:pointer-events-none disabled:opacity-50'
        )}
      >
        {uploading ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : (
          <ImagePlus className="size-4" />
        )}
        {uploading ? 'Enviando…' : label}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          disabled={uploading}
          onChange={(event) => {
            handleFile(event.target.files?.[0])
            event.target.value = ''
          }}
        />
      </label>
    </div>
  )
}
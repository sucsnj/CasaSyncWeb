import { LoaderCircle } from 'lucide-react'

export default function Loading() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-slate-100">
      <div className="flex flex-col items-center gap-3">
        <LoaderCircle className="size-8 animate-spin text-blue-600" />
        <p className="text-sm font-medium text-slate-600">Carregando…</p>
      </div>
    </div>
  )
}
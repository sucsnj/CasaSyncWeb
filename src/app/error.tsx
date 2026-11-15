'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 bg-slate-100 px-6 text-center">
      <h1 className="text-2xl font-bold text-slate-800">Algo deu errado</h1>
      <p className="max-w-md text-sm text-slate-600">
        Não conseguimos carregar esta tela. Tente novamente — se o problema
        persistir, avise o tutor da casa.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
        >
          Tentar novamente
        </button>
        <Link
          href="/"
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
        >
          Voltar para o início
        </Link>
      </div>
    </main>
  )
}

import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 bg-slate-100 px-6 text-center">
      <p className="text-6xl font-black text-blue-600">404</p>
      <h1 className="text-2xl font-bold text-slate-800">Página não encontrada</h1>
      <p className="max-w-md text-sm text-slate-600">
        O endereço que você tentou abrir não existe ou foi movido.
      </p>
      <Link
        href="/"
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
      >
        Voltar para o início
      </Link>
    </main>
  )
}

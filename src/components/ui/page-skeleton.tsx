import { cn } from '@/lib/utils'

type PageSkeletonProps = {
  header?: boolean
  hero?: boolean
  cards?: number
  cols?: 2 | 3
}

/**
 * Skeleton de transição exibido nos `loading.tsx` enquanto o Server Component
 * da rota destino renderiza (fetch de sessão/casa/tarefas no servidor).
 * Placeholders com `animate-pulse` no visual do app — feedback instantâneo,
 * sem re-render de dados.
 */
export function PageSkeleton({
  header = false,
  hero = true,
  cards = 3,
  cols = 3,
}: PageSkeletonProps) {
  return (
    <>
      {header ? (
        <header className="fixed inset-x-0 top-0 z-50 flex h-16 items-center justify-between gap-3 bg-blue-700 px-4 shadow-md md:px-6">
          <div className="flex items-center gap-2">
            <div className="size-9 animate-pulse rounded-xl bg-white/15" />
            <div className="h-5 w-24 animate-pulse rounded bg-white/20" />
          </div>
          <div className="flex items-center gap-2">
            <div className="size-8 animate-pulse rounded-full bg-white/15" />
            <div className="size-8 animate-pulse rounded-full bg-white/15" />
          </div>
        </header>
      ) : null}

      <div
        className={cn(
          'flex flex-col gap-6',
          header && 'p-4 pt-20 pb-24 md:p-6 md:pt-24 md:pb-6'
        )}
      >
        {hero ? (
          <div className="animate-pulse rounded-3xl bg-gradient-to-r from-blue-600/70 to-indigo-600/70 p-6">
            <div className="flex flex-col gap-3">
              <div className="h-3 w-32 rounded bg-white/30" />
              <div className="h-6 w-44 rounded bg-white/40" />
              <div className="h-3 w-64 rounded bg-white/30" />
            </div>
          </div>
        ) : null}

        <div
          className={cn(
            'grid gap-4',
            cols === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
          )}
        >
          {Array.from({ length: cards }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="size-11 rounded-xl bg-slate-200" />
              <div className="mt-4 h-4 w-2/3 rounded bg-slate-200" />
              <div className="mt-2 h-3 rounded bg-slate-100" />
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
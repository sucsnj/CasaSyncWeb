'use client'

import { Button } from '@/components/ui/button'

export type QueryErrorProps = {
  /** Mensagem opcional; default é genérico. */
  message?: string
  /** Callback de nova tentativa (refetch). */
  onRetry: () => void
}

/** Card de erro ao carregar o bundle (ex.: FORBIDDEN/offline). */
export function QueryError({ message, onRetry }: QueryErrorProps) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <div className="flex flex-col gap-1.5">
        <p className="font-heading text-base font-semibold text-slate-800">
          Não foi possível carregar agora
        </p>
        <p className="text-sm text-slate-500">
          {message ??
            'Verifique sua conexão e tente novamente. Se persistir, avise o tutor da casa.'}
        </p>
      </div>
      <Button onClick={onRetry} variant="outline">
        Tentar novamente
      </Button>
    </div>
  )
}

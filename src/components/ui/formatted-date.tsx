'use client'

import { useMemo, useSyncExternalStore } from 'react'

const emptySubscribe = () => () => {}

/**
 * Formata um instante na hora LOCAL do dispositivo, mas SÓ no cliente.
 *
 * Durante o server render (Vercel/Netlify giram em UTC) formatar com getters
 * locais produziria hora de parede UTC no HTML inicial, enquanto o browser
 * re-hidrata com a hora do device — hydration mismatch + flash de hora errada.
 * Via `useSyncExternalStore`, o primeiro render do servidor E o da hidratação
 * usam o snapshot do servidor (o mesmo placeholder estável); só depois da
 * hidratação o React relê o snapshot real e troca pela hora local de quem vê.
 * A formatação é memoizada por `iso`/`locale` (referencialmente estável, sem
 * loop de re-render).
 */
export function FormattedDateTime({
  iso,
  locale = 'pt-BR',
}: {
  iso: string | null
  locale?: string
}) {
  const value = useMemo(() => {
    if (!iso) return null
    const date = new Date(iso)
    return Number.isNaN(date.getTime()) ? null : date.toLocaleString(locale)
  }, [iso, locale])

  const formatted = useSyncExternalStore(emptySubscribe, () => value, () => null)

  return <>{formatted ?? '—'}</>
}
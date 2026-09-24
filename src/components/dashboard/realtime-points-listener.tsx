'use client'

import { useRouter } from 'next/navigation'
import { usePostgresChanges } from '@/hooks/use-postgres-changes'
import type { Tables } from '@/types/database'

/**
 * Mantém a tela do DEPENDENT sincronizada quando o ADMIN ajusta
 * `profiles.points` (updateDependentPoints com o PIN da casa, penalidade etc.): ouvindo
 * UPDATEs na própria linha do perfil, dispara `router.refresh()` para os
 * Server Components refletirem o novo saldo no badge/nav e nos cards.
 *
 * Usa `usePostgresChanges` (que faz `getSession()` + `realtime.setAuth()` antes
 * de assinar — ver ADR-0010): sem o setAuth, com a sessão restaurada de
 * cookies/storage, o socket conecta como `anon` e o RLS descarta os eventos em
 * silêncio (SUBSCRIBED mas zero entregas). Não trocar por um
 * `supabase.channel()` cru.
 */
export function RealtimePointsListener({ userId }: { userId: string }) {
  const router = useRouter()

  usePostgresChanges<Tables<'profiles'>>({
    table: 'profiles',
    filter: `id=eq.${userId}`,
    event: 'UPDATE',
    onUpsert: () => {
      router.refresh()
    },
  })

  return null
}
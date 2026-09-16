'use client'

import { useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'

/**
 * Mantém o saldo de `profiles.points` do usuário sincronizado ao vivo.
 *
 * ENSINO (teach): um UPDATE disparado por outra pessoa (ex.: ADMIN aprovando
 * uma tarefa) é refletido aqui sem refetch. O RLS garante que só o dono do
 * perfil consegue ler a própria linha — logo o filter `id=eq.<userId>` nunca
 * entrega dados de outro membro da casa (defesa em camadas: filter + RLS).
 */
export function useProfilePoints(
  userId: string | undefined,
  onPointsChange: (points: number) => void
) {
  useEffect(() => {
    if (!userId) return

    const supabase = createClient()
    const channel = supabase.channel(`profile-points:${userId}`)

    channel
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${userId}`,
        },
        (payload) => {
          const points = (payload.new as { points?: number }).points
          if (typeof points === 'number') {
            onPointsChange(points)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, onPointsChange])
}
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client' // ou o seu path do cliente Supabase

export function RealtimePointsListener({ userId }: { userId: string }) {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()

    // Escuta alterações na tabela 'profiles' especificamente para o registro deste usuário
    const channel = supabase
      .channel(`profile-points-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${userId}`,
        },
        () => {
          // Quando o admin altera a coluna 'points', revalida os Server Components instantaneamente
          router.refresh()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, router])

  return null
}
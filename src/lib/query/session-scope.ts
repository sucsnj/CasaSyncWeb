'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'

export type SessionScope = { userId: string | null; ready: boolean }

export function useSessionScope(): SessionScope {
  const [scope, setScope] = useState<SessionScope>({ userId: null, ready: false })

  useEffect(() => {
    const supabase = createClient()
    let mounted = true

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted) {
        setScope({ userId: session?.user?.id ?? null, ready: true })
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setScope({ userId: session?.user?.id ?? null, ready: true })
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  return scope
}

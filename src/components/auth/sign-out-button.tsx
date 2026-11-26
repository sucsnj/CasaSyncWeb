'use client'

import { useTransition } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { del } from 'idb-keyval'
import { createClient } from '@/utils/supabase/client'
import { getRecentAccounts } from '@/utils/recent-accounts'
import { unregisterAllPushSubscriptions } from '@/actions/push'
import { PERSIST_KEY } from '@/lib/query/persist'
import { Button } from '@/components/ui/button'
import { LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'

export function SignOutButton({
  variant = 'button',
  className,
}: {
  variant?: 'button' | 'nav'
  className?: string
}) {
  const queryClient = useQueryClient()
  const [pending, startTransition] = useTransition()

  function handleSignOut() {
    startTransition(async () => {
      const supabase = createClient()
      // Revoga as push subscriptions no servidor ANTES do signOut: depois
      // dele a sessão some e a action não teria como autorizar a remoção.
      await unregisterAllPushSubscriptions()
      // Descarta a memória e o IndexedDB do query cache: outra conta que
      // entrar neste dispositivo não pode ver dados residuais.
      queryClient.clear()
      await del(PERSIST_KEY).catch(() => undefined)

      // Logout seguro: se o aparelho tem QUALQUER conta com biometria ativa,
      // usa sempre scope 'local' para não revogar os refresh_tokens guardados
      // no cofre. Não depende de getUser() (pode retornar nulo na WebView).
      const recent = await getRecentAccounts()
      const hasBiometric = recent.some((account) => account.biometricEnabled)
      await supabase.auth.signOut({
        scope: hasBiometric ? 'local' : 'global',
      })
      // Full reload: evita a corrida em que o proxy redireciona de volta para
      // o dashboard (router.push + refresh dispara o redirect com a sessão
      // ainda visível no cookie).
      window.location.replace('/login')
    })
  }

  if (variant === 'nav') {
    return (
      <button
        type="button"
        onClick={handleSignOut}
        disabled={pending}
        className={cn(
          'flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 py-2 text-slate-500 transition-colors',
          'hover:text-blue-600 active:text-blue-700 disabled:pointer-events-none disabled:opacity-50',
          className
        )}
      >
        <LogOut className="size-5" />
        <span className="text-[0.7rem] font-medium leading-none">
          {pending ? 'Saindo…' : 'Sair'}
        </span>
      </button>
    )
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={handleSignOut}
      className={className}
    >
      {pending ? 'Saindo...' : 'Sair'}
    </Button>
  )
}
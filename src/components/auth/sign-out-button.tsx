'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
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
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function handleSignOut() {
    startTransition(async () => {
      const supabase = createClient()
      await supabase.auth.signOut()
      router.push('/login')
      router.refresh()
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
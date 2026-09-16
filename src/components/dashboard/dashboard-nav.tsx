'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CircleCheck, Gift, House, LayoutDashboard, ListTodo } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SignOutButton } from '@/components/auth/sign-out-button'

export type NavItem = { href: string; label: string }

const itemIcons = {
  '/dashboard/admin': LayoutDashboard,
  '/dashboard/dependent': LayoutDashboard,
  '/dashboard/admin/houses': House,
  '/tasks': ListTodo,
  '/rewards': Gift,
} as const

function activeFor(href: string, pathname: string) {
  if (href === '/dashboard/admin' || href === '/dashboard/dependent') {
    return pathname === href
  }
  return pathname.startsWith(href)
}

export function DashboardNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname()

  return (
    <>
      {/* Navegação superior — desktop apenas */}
      <nav className="hidden items-center justify-between gap-2 md:flex">
        <div className="flex flex-wrap items-center gap-1">
          {items.map((item) => {
            const active = activeFor(item.href, pathname)
            return (
              <Link
                key={item.href}
                href={item.href}
                data-active={active}
                className={cn(
                  'rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200 active:scale-95',
                  'text-slate-500 hover:bg-muted hover:text-slate-800',
                  'data-[active=true]:bg-blue-600 data-[active=true]:text-white'
                )}
              >
                {item.label}
              </Link>
            )
          })}
        </div>

        <SignOutButton />
      </nav>

      {/* Bottom navigation — mobile (área de toque mínima de 48px) */}
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
        <div className="mx-auto flex max-w-md items-stretch">
          {items.map((item) => {
            const active = activeFor(item.href, pathname)
            const Icon = itemIcons[item.href as keyof typeof itemIcons] ?? CircleCheck
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                data-active={active}
                className={cn(
                  'flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 py-2 text-slate-500 transition-all duration-200 active:scale-95',
                  'active:text-blue-700',
                  'data-[active=true]:text-blue-600'
                )}
              >
                <Icon className="size-5" strokeWidth={active ? 2.25 : 2} />
                <span className="text-[0.7rem] font-medium leading-none">
                  {item.label}
                </span>
              </Link>
            )
          })}

          {/* Slots extras no mobile: Sair quando não há 4 itens fixos */}
          {items.length < 4 ? <SignOutButton variant="nav" /> : null}
        </div>
      </nav>
    </>
  )
}
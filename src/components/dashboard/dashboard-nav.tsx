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

export function DashboardNav({
  items,
  userName,
  points,
}: {
  items: NavItem[]
  userName?: string | null
  points?: number | null
}) {
  const pathname = usePathname()
  const initial = userName?.trim()?.[0]?.toUpperCase() ?? 'U'
  const brandHref = items[0]?.href ?? '/'

  return (
    <>
      {/* Cabeçalho fixo — azul sólido, alto contraste */}
      <header className="fixed inset-x-0 top-0 z-50 bg-blue-700 text-white shadow-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4 md:px-6">
          <Link href={brandHref} className="flex min-h-12 items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-white/10 text-amber-300">
              <House className="size-5" />
            </span>
            <span className="text-lg font-bold tracking-tight">CasaSync</span>
          </Link>

          {/* Navegação central — desktop */}
          <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 md:flex">
            {items.map((item) => {
              const active = activeFor(item.href, pathname)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-active={active}
                  className={cn(
                    'rounded-xl px-3 py-2 text-sm font-medium text-blue-100 transition-all duration-200',
                    'hover:bg-white/10 hover:text-white active:scale-95',
                    'data-[active=true]:bg-white/20 data-[active=true]:font-semibold data-[active=true]:text-white'
                  )}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>

          <div className="flex items-center gap-2">
            {typeof points === 'number' ? (
              <span className="flex items-center rounded-full bg-amber-400 px-2.5 py-1 text-sm font-bold text-slate-900 shadow-sm">
                {points} pts
              </span>
            ) : null}
            <span className="flex size-8 items-center justify-center rounded-full bg-white/15 text-sm font-bold text-white">
              {initial}
            </span>
            <span className="hidden max-w-[9rem] truncate text-sm font-medium text-white md:block">
              {userName}
            </span>
            <div className="hidden md:block">
              <SignOutButton className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white" />
            </div>
          </div>
        </div>
      </header>

      {/* Bottom navigation — mobile (fundos escuros, ícone ativo em destaque) */}
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-slate-900 pb-[env(safe-area-inset-bottom)] text-slate-300 shadow-[0_-4px_16px_rgba(2,6,23,0.25)] md:hidden">
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
                  'flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 py-2 transition-all duration-200 active:scale-95',
                  active ? 'text-sky-400' : 'text-slate-400 hover:text-white'
                )}
              >
                <span
                  data-active={active}
                  className="flex size-9 items-center justify-center rounded-xl transition-colors data-[active=true]:bg-blue-600 data-[active=true]:text-white"
                >
                  <Icon className="size-5" strokeWidth={active ? 2.25 : 2} />
                </span>
                <span className="text-[0.7rem] font-medium leading-none">
                  {item.label}
                </span>
              </Link>
            )
          })}

          {/* Slots extras no mobile: Sair quando não há 4 itens fixos */}
          {items.length < 4 ? (
            <SignOutButton
              variant="nav"
              className="text-slate-400 hover:text-white active:text-sky-400"
            />
          ) : null}
        </div>
      </nav>
    </>
  )
}
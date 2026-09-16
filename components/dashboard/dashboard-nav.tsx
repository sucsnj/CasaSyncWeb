'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { SignOutButton } from '@/components/auth/sign-out-button'

export type NavItem = { href: string; label: string }

export function DashboardNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname()

  return (
    <nav className="flex items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-1">
        {items.map((item) => {
          const active =
            item.href === '/dashboard/admin'
              ? pathname === item.href
              : pathname.startsWith(item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              data-active={active}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                'text-muted-foreground hover:bg-muted hover:text-foreground',
                'data-[active=true]:bg-muted data-[active=true]:text-foreground'
              )}
            >
              {item.label}
            </Link>
          )
        })}
      </div>

      <SignOutButton />
    </nav>
  )
}
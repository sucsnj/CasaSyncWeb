'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { CircleCheck, Gift, House, LayoutDashboard, ListTodo, Trophy } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { SignOutButton } from '@/components/auth/sign-out-button'
import { NotificationsBell } from '@/components/notifications/notifications-bell'
import { Modal } from '@/components/ui/modal'
import { useClaimableAchievement } from '@/hooks/use-claimable-achievement'
import { PunishmentIndicator } from '@/components/punishments/punishment-indicator'
import { selectHouse } from '@/actions/houses'
import type { NotificationRow } from '@/types/notifications'
import type { QuickMessageSettings } from '@/utils/settings'
import type { ActivePunishment } from '@/utils/punishments'

export type NavItem = { href: string; label: string }

const itemIcons = {
  '/dashboard/admin': LayoutDashboard,
  '/dashboard/dependent': LayoutDashboard,
  '/dashboard/admin/houses': House,
  '/tasks': ListTodo,
  '/rewards': Gift,
  '/achievements': Trophy,
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
  userId,
  notifications,
  role,
  quickMessageSettings,
  hasClaimableAchievement,
  punishment,
  activeHouseId,
  houseNames,
}: {
  items: NavItem[]
  userName?: string | null
  points?: number | null
  userId?: string
  notifications?: NotificationRow[]
  role?: 'ADMIN' | 'DEPENDENT'
  quickMessageSettings?: QuickMessageSettings
  /** Dependente com resgate de conquista disponível → item "Conquistas" dourado. */
  hasClaimableAchievement?: boolean
  /**
   * Castigo ativo do dependente (ADR-0020) — quando presente, mostra o ícone de
   * triângulo ao lado do sino. Só o DEPENDENT recebe a prop (o ADMIN é quem
   * aplica/remove o castigo), e sem Realtime: vem do render server-side.
   */
  punishment?: ActivePunishment | null
  /**
   * Casa ativa (ADMIN multi-casa) — o sino usa para saber quando uma
   * notificação é de outra casa: mostra o nome dela no card e troca a casa
   * antes de navegar. Só o ADMIN precisa (o dependente tem uma casa só).
   */
  activeHouseId?: string | null
  /** `house_id → nome` das casas do ADMIN, para o chip e o aviso de troca. */
  houseNames?: Record<string, string>
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [showAccount, setShowAccount] = useState(false)
  const claimable = useClaimableAchievement(hasClaimableAchievement)
  const initial = userName?.trim()?.[0]?.toUpperCase() ?? 'U'
  const brandHref = items[0]?.href ?? '/'

  /**
   * Clique numa notificação **push** (o app estava em background ou fechado).
   *
   * O `notificationclick` do service worker manda esta mensagem; antes não havia
   * listener nenhum, então o clique no push simplesmente não navegava. O `url` é
   * **relativo** e a página resolve pela casa ativa — então, se a notificação for
   * de outra casa do ADMIN, trocamos a casa ANTES de navegar (mesmo caminho do
   * clique no sino).
   */
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'NOTIFICATION_CLICK') return
      const url: unknown = event.data?.url
      const houseId: unknown = event.data?.houseId
      if (typeof url !== 'string') return

      const open = async () => {
        // Só o ADMIN tem várias casas e pode trocar de casa.
        if (
          role === 'ADMIN' &&
          typeof houseId === 'string' &&
          houseId &&
          houseId !== activeHouseId
        ) {
          const result = await selectHouse(houseId)
          if (!result.ok) {
            toast.error(result.error)
            return
          }
          const name = houseNames?.[houseId]
          toast.info(name ? `Você mudou para a casa ${name}.` : 'Casa ativa alterada.')
        }
        router.push(url)
        // `push` para a MESMA rota é no-op e não traz props novas; o `refresh`
        // garante que a página já renderize a casa nova.
        router.refresh()
      }

      void open()
    }

    navigator.serviceWorker.addEventListener('message', handleMessage)
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage)
    }
    // `houseNames`/`activeHouseId` entram no dep de propósito: sem eles o
    // closure usaria a casa ativa antiga depois de uma troca. São props do
    // servidor, então só mudam quando o app navega de verdade.
  }, [role, router, activeHouseId, houseNames])

  return (
    <>
      {/* Cabeçalho fixo — azul sólido, alto contraste */}
      <header className="fixed inset-x-0 top-0 z-50 bg-blue-700 text-white shadow-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 md:px-6">
          <Link href={brandHref} className="flex min-h-12 items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-white/10 text-amber-300">
              <img
                src='/icons/icon-512.png'
                alt="CasaSync Logo"
                className="size-9 rounded-lg"
              />
              {/* <House className="size-5" /> Não mais utilizado para dar lugar ao ícone do app*/}
            </span>
            <span className="text-lg font-bold tracking-tight">CasaSync</span>
          </Link>

          {/* Navegação central — desktop (in-flow, centrada entre marca e ações) */}
          <nav className="hidden flex-1 items-center justify-center gap-1 md:flex">
            {items.map((item) => {
              const active = activeFor(item.href, pathname)
              // Ouro = há recompensa de conquista esperando resgate no item
              // "Conquistas" (tem prioridade sobre o destaque de item ativo).
              const gold = claimable && item.href === '/achievements'
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-active={active}
                  className={cn(
                    'rounded-xl px-3 py-2 text-sm font-medium text-blue-100 transition-all duration-200',
                    'hover:bg-white/10 hover:text-white active:scale-95',
                    gold
                      ? 'bg-amber-400 font-semibold text-slate-900 shadow-sm hover:bg-amber-300 hover:text-slate-900'
                      : 'data-[active=true]:bg-white/20 data-[active=true]:font-semibold data-[active=true]:text-white'
                  )}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>

          <div className="flex items-center gap-2">
            {userId ? (
              <NotificationsBell
                userId={userId}
                initialNotifications={notifications ?? []}
                canSend={role === 'DEPENDENT'}
                quickMessageSettings={quickMessageSettings}
                activeHouseId={activeHouseId}
                houseNames={houseNames}
              />
            ) : null}
            {punishment ? <PunishmentIndicator punishment={punishment} /> : null}
            {typeof points === 'number' ? (
              <span className="flex items-center rounded-full bg-amber-400 px-2.5 py-1 text-sm font-bold text-slate-900 shadow-sm">
                {points} pts
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => setShowAccount(true)}
              aria-label="Abrir sua conta e opção de sair"
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-sm font-bold text-white transition-all duration-200 hover:bg-white/25 active:scale-95"
            >
              {initial}
            </button>
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
            const gold = claimable && item.href === '/achievements'
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                data-active={active}
                className={cn(
                  'flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 py-2 transition-all duration-200 active:scale-95',
                  gold
                    ? 'text-amber-300'
                    : active
                      ? 'text-sky-400'
                      : 'text-slate-400 hover:text-white'
                )}
              >
                <span
                  data-active={active}
                  className={cn(
                    'flex size-9 items-center justify-center rounded-xl transition-colors',
                    gold
                      ? 'bg-amber-400 text-slate-900'
                      : 'data-[active=true]:bg-blue-600 data-[active=true]:text-white'
                  )}
                >
                  <Icon className="size-5" strokeWidth={active || gold ? 2.25 : 2} />
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

      {/* Conta: aberta ao tocar no avatar — garante "Sair" em qualquer tela */}
      <Modal
        open={showAccount}
        onClose={() => setShowAccount(false)}
        title="Sua conta"
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-sky-100 text-lg font-bold text-sky-700">
              {initial}
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium text-slate-800">
                {userName ?? 'Usuário'}
              </p>
              {typeof points === 'number' ? (
                <p className="text-sm text-slate-500">{points} pontos</p>
              ) : null}
            </div>
          </div>
          <SignOutButton className="w-full" />
        </div>
      </Modal>
    </>
  )
}
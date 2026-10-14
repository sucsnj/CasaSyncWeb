import { after } from 'next/server'
import { getDueComunicados } from '@/actions/comunicados'
import { registerLoginDay } from '@/actions/stats'
import { AlertQueueOverlay } from '@/components/alerts/alert-queue-overlay'
import { DashboardNav } from '@/components/dashboard/dashboard-nav'
import {
  ADMIN_NAV_ITEMS,
  DEPENDENT_NAV_ITEMS,
} from '@/components/dashboard/nav-items'
import { PushNotificationsSetup } from '@/components/notifications/push-notifications-setup'
import { PushPermissionPrompt } from '@/components/notifications/push-permission-prompt'
import { RealtimeToastListener } from '@/components/notifications/realtime-toast-listener'
import { hasClaimableAchievement } from '@/utils/achievement-progress'
import { getActivePunishment } from '@/utils/active-punishment'
import {
  getActiveAdminHouse,
  getAdminHouses,
  getDependentHouse,
  getSessionProfile,
} from '@/utils/house'
import { getHouseQuickMessageSettings } from '@/utils/house-settings'
import { getMyNotifications } from '@/utils/notifications'

/**
 * Shell das rotas "de topo" e sensíveis ao papel (`/tasks`, `/rewards`,
 * `/achievements`) — o mesmo papel que o `layout.tsx` cumpre dentro de
 * `/dashboard/*`.
 *
 * **Por que existem:** essas três rotas são de topo na URL e não tinham layout
 * próprio — cada uma montava o `DashboardNav` **dentro do `page.tsx`**. O
 * `loading.tsx` do segmento substitui a página inteira, então durante a
 * navegação a nav sumia (virava um bloco cinza do `PageSkeleton`) junto com a
 * bottom nav. Layouts ficam **acima** do Suspense criado pelo `loading.tsx`, por
 * isso o shell mora aqui e o skeleton cobre só o conteúdo.
 *
 * Ganho extra: como o grupo tem um layout só, navegar entre `/tasks`,
 * `/rewards` e `/achievements` **não remonta mais** a nav, o sino, o toast
 * listener nem o registro de push — antes cada página montava o seu.
 *
 * O shell é role-aware (as três rotas servem ADMIN e DEPENDENT), por isso lê o
 * papel da sessão. A página **não** repete nada disso: ela carrega só os dados
 * do próprio conteúdo.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, profile } = await getSessionProfile()

  // Rede de segurança: o proxy já manda quem não tem sessão para /login e cada
  // página do grupo repete o `redirect`. Sem sessão não há papel para escolher os
  // itens da nav — o shell não renderiza (mesmo comportamento do layout do
  // dependente).
  if (!user || !profile) return null

  const isAdmin = profile.user_role === 'ADMIN'

  const [notifications, activeHouse, dependentHouse, adminHouses, hasClaimable] =
    await Promise.all([
      getMyNotifications(user.id),
      isAdmin ? getActiveAdminHouse() : Promise.resolve(null),
      isAdmin ? Promise.resolve(null) : getDependentHouse(user.id),
      // Nomes das casas do ADMIN: o sino marca de qual casa é cada notificação
      // e troca a casa antes de navegar. De graça — `getActiveAdminHouse` já
      // chama `getAdminHouses` por dentro e ambos são `React.cache`.
      isAdmin ? getAdminHouses(user.id) : Promise.resolve([]),
      // Item "Conquistas" da nav dourado quando há resgate disponível.
      isAdmin ? Promise.resolve(false) : hasClaimableAchievement(user.id),
    ])

  const houseNames = Object.fromEntries(
    adminHouses.map((house) => [house.id, house.name])
  )

  // Ajustes do sino do DEPENDENT (limite de caracteres da mensagem rápida) e o
  // castigo ativo do tutor (ADR-0020 — ícone de triângulo, sem Realtime: lido
  // no render, como os comunicados).
  const quickMessageSettings =
    !isAdmin && dependentHouse
      ? await getHouseQuickMessageSettings(dependentHouse.id)
      : undefined

  const punishment =
    !isAdmin && dependentHouse
      ? await getActivePunishment(user.id, dependentHouse.id)
      : null

  // Comunicados "devidos" do dependente (1ª exibição pendente ou repetição
  // agendada vencida). Fica no shell porque a fila é a mesma nas três rotas —
  // antes cada página carregava e montava o overlay por conta própria.
  const dueComunicados =
    !isAdmin && dependentHouse ? await getDueComunicados() : []

  // Conquistas: conta o acesso diário do dependente (APP_LOGIN_DAYS e
  // STREAK_LOGIN_DAYS). Escrita, fora do caminho do render (ver a nota no
  // layout do dependente).
  if (!isAdmin && dependentHouse) {
    after(() => registerLoginDay(dependentHouse.id, user.id))
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-7xl flex-col gap-6 p-4 pt-20 pb-24 md:p-6 md:pt-24 md:pb-6">
      <DashboardNav
        items={isAdmin ? ADMIN_NAV_ITEMS : DEPENDENT_NAV_ITEMS}
        userName={profile.full_name}
        // ADMIN não acumula pontos — o badge e a linha do modal "Sua conta"
        // só existem para o dependente.
        points={isAdmin ? undefined : profile.points}
        userId={user.id}
        notifications={notifications}
        role={isAdmin ? 'ADMIN' : 'DEPENDENT'}
        quickMessageSettings={quickMessageSettings}
        hasClaimableAchievement={isAdmin ? undefined : hasClaimable}
        punishment={isAdmin ? null : punishment}
        activeHouseId={isAdmin ? (activeHouse?.id ?? null) : (dependentHouse?.id ?? null)}
        houseNames={isAdmin ? houseNames : undefined}
      />
      <RealtimeToastListener userId={user.id} />
      <PushNotificationsSetup userId={user.id} />
      <PushPermissionPrompt userId={user.id} />
      {!isAdmin ? (
        // Fila bloqueante única do dependente: comunicados publicados e alertas
        // de penalização, um por vez em FIFO (a penalização não tem prioridade).
        <AlertQueueOverlay
          userId={user.id}
          initialQueue={dueComunicados}
          initialNotifications={notifications}
        />
      ) : null}
      {children}
    </div>
  )
}
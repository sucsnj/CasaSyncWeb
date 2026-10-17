import type { NavItem } from '@/components/dashboard/dashboard-nav'

/**
 * Itens da navegação por papel — **fonte única**.
 *
 * Antes cada tela que montava o `DashboardNav` repetia os mesmos arrays (o
 * layout do ADMIN, o do dependente e as 3 páginas `/tasks`, `/rewards`,
 * `/achievements`), então incluir ou renomear um item exigia acertar 5 lugares
 * e o erro aparecia como item faltando em uma tela só. Agora todo shell
 * importa daqui.
 *
 * ADMIN tem 5 itens e o dependente 5 — o slot extra da bottom nav do mobile só
 * existe com menos de 4 (ver `dashboard-nav.tsx`).
 *
 * "Comunicados" **não** entra: é acessado pelo card na visão geral, por decisão
 * de produto (sem item na nav). O "Baú" entra **só para o dependente**: o ADMIN
 * gerencia o acervo pelo card na visão geral, como os comunicados (ADR-0024,
 * item 14).
 */
export const ADMIN_NAV_ITEMS: NavItem[] = [
  { href: '/dashboard/admin', label: 'Visão geral' },
  { href: '/dashboard/admin/houses', label: 'Casas' },
  { href: '/tasks', label: 'Tarefas' },
  { href: '/rewards', label: 'Recompensas' },
  { href: '/achievements', label: 'Conquistas' },
]

export const DEPENDENT_NAV_ITEMS: NavItem[] = [
  { href: '/dashboard/dependent', label: 'Visão geral' },
  { href: '/tasks', label: 'Tarefas' },
  { href: '/rewards', label: 'Recompensas' },
  { href: '/achievements', label: 'Conquistas' },
  { href: '/chest', label: 'Baú' },
]
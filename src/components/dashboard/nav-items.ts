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
 * ADMIN tem 5 itens e o dependente 4 — o slot extra da bottom nav do mobile só
 * existe com menos de 4 (ver `dashboard-nav.tsx`).
 *
 * **"Comunicados" não entra** (ADMIN) e **"Baú" não entra para nenhum papel**
 * (ADR-0024): os dois são acessados pelo card na visão geral, por decisão de
 * produto. O Baú no dependente saiu da nav porque o quinto item deixava a bottom
 * nav do mobile apertada — e o card da visão geral é onde o aluno procura uma
 * biblioteca de material, não a barra de ícones.
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
]
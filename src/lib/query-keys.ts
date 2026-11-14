/**
 * Fábrica central das chaves de cache do React Query.
 *
 * **Por que uma fábrica:** a chave é o contrato entre quem escreve no cache
 * (Realtime, mutações, hidratação do RSC) e quem lê. Escrever a chave à mão em
 * dois lugares é a forma clássica de o dado "não atualizar" — o erro silencioso
 * mais caro de um cache de cliente.
 *
 * **Formato:** o primeiro segmento é a **rota/escopo** (`tasks`, `rewards`,
 * `achievements`, `chest`), e o segundo o recorte dentro dela. Isso permite
 * invalidar a tela inteira com `invalidateQueries({ queryKey: [scope] })` — é o
 * que o pull-to-refresh usa — sem tocar nas chaves das outras telas.
 */

export const queryScope = {
  tasks: 'tasks',
  rewards: 'rewards',
  achievements: 'achievements',
  chest: 'chest',
  notifications: 'notifications',
  profile: 'profile',
} as const

export type QueryScope = (typeof queryScope)[keyof typeof queryScope]

export const queryKeys = {
  /** Todas as queries (limpeza total do cache). */
  all: ['__all'] as const,

  /** Tarefas da casa (visão do ADMIN). */
  tasks: {
    house: (houseId: string) => [queryScope.tasks, 'house', houseId] as const,
    dependent: (userId: string) =>
      [queryScope.tasks, 'dependent', userId] as const,
  },

  /**
   * Recompensas: catálogo, resgates e sugestões da casa — **uma** chave (e
   * portanto **uma** Server Action) para a tela inteira. As três listas mudam
   * juntas (uma aprovação cria/atualiza resgate, sugestão e catálogo), então
   * separá-las só criaria ações concorrentes na revalidação.
   */
  rewards: {
    screen: (houseId: string) => [queryScope.rewards, houseId] as const,
  },

  /**
   * Conquistas + progresso — **uma** chave (e **uma** Server Action) para a
   * tela. O `userId` entra porque o progresso do ADMIN é o da casa toda e o do
   * dependente é só o dele: a mesma casa, conteúdos diferentes.
   */
  achievements: {
    screen: (houseId: string, userId: string) =>
      [queryScope.achievements, houseId, userId] as const,
  },

  /** Baú da casa. */
  chest: {
    items: (houseId: string) => [queryScope.chest, 'items', houseId] as const,
  },

  /** Sino de notificações. */
  notifications: {
    list: (userId: string) => [queryScope.notifications, 'list', userId] as const,
  },

  /** Perfil do usuário (saldo/pontos — dado crítico). */
  profile: {
    byUser: (userId: string) => [queryScope.profile, 'byUser', userId] as const,
  },
} as const

/**
 * Escopo de cache que pertence à rota ativa — usado pelo pull-to-refresh para
 * invalidar **só** o que a tela mostra (em vez de limpar o cache da sessão).
 *
 * Rotas do shell (`/dashboard/*`) não têm escopo próprio: elas são renderizadas
 * pelo servidor e se atualizam com `router.refresh()`.
 */
export function queryScopeForPath(pathname: string): QueryScope | null {
  if (pathname === '/tasks' || pathname.startsWith('/tasks/')) {
    return queryScope.tasks
  }
  if (pathname === '/rewards' || pathname.startsWith('/rewards/')) {
    return queryScope.rewards
  }
  if (pathname === '/achievements' || pathname.startsWith('/achievements/')) {
    return queryScope.achievements
  }
  if (pathname === '/chest' || pathname.startsWith('/chest/')) {
    return queryScope.chest
  }
  return null
}

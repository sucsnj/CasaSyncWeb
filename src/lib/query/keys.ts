/**
 * Contrato único de chaves do cache. Tudo que é escopado por casa usa o
 * prefixo ['tenant', houseId]; tudo que é escopado pelo usuário usa
 * ['user', userId]. Nunca use pathname nem profile sem o userId — trocar de
 * casa (ADMIN) ou de conta no mesmo dispositivo não pode vazar dado.
 *
 * `qk.shell` fica FORA do persistente (IndexedDB): o shell carrega
 * comunicados pendentes, que jamais devem ser gravados em disco.
 */
export const qk = {
  shell: (userId: string) => ['shell', userId] as const,
  housesBundle: (userId: string) => ['houses', userId] as const,
  comunicadosBundle: (houseId: string) => ['comunicados', houseId] as const,
  tenant: (houseId: string) => ['tenant', houseId] as const,
  tasks: (houseId: string) => ['tenant', houseId, 'tasks'] as const,
  rewards: (houseId: string) => ['tenant', houseId, 'rewards'] as const,
  redemptions: (houseId: string) =>
    ['tenant', houseId, 'redemptions'] as const,
  chest: (houseId: string) => ['tenant', houseId, 'chest'] as const,
  achievements: (houseId: string) =>
    ['tenant', houseId, 'achievements'] as const,
  comunicados: (houseId: string) => ['tenant', houseId, 'comunicados'] as const,
  punishments: (houseId: string) => ['tenant', houseId, 'punishments'] as const,
  points: (userId: string) => ['user', userId, 'points'] as const,
  notifications: (userId: string) => ['user', userId, 'notifications'] as const,
  houses: (userId: string) => ['user', userId, 'houses'] as const,
  profile: (userId: string) => ['user', userId, 'profile'] as const,
}

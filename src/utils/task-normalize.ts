/**
 * Normaliza um título de tarefa para comparação de duplicidade/busca
 * case-insensitive, ignorando acentos e espaços extras. Ex.: "Lavar louça",
 * "lavar louca" e "Lavar  Louça " viram a mesma chave — usado no autocomplete
 * e no soft block do ADMIN (client) e no guard server de `createTask`.
 */
export function normalizeTaskTitle(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
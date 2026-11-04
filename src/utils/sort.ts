export type SortDirection = 'asc' | 'desc'

export type SortOption = {
  value: string
  label: string
  key: string
  direction: SortDirection
}

export function compareSortValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  if (typeof a === 'string' && typeof b === 'string') {
    return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' })
  }
  if (typeof a === 'boolean' && typeof b === 'boolean') {
    return Number(a) - Number(b)
  }
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime()
  const an = Number(a)
  const bn = Number(b)
  if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn
  return String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' })
}

export function sortBy<T>(
  items: readonly T[],
  getter: (item: T) => unknown,
  direction: SortDirection = 'asc'
): T[] {
  const sorted = [...items].sort((a, b) => compareSortValues(getter(a), getter(b)))
  return direction === 'desc' ? sorted.reverse() : sorted
}
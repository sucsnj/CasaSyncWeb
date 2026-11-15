/** Upsert cronológico (mais recente primeiro) por `created_at`. */
export function upsertById<T extends { id: string; created_at: string }>(
  list: T[],
  item: T
): T[] {
  const exists = list.some((entry) => entry.id === item.id)
  const next = exists
    ? list.map((entry) => (entry.id === item.id ? item : entry))
    : [item, ...list]
  return next.sort((a, b) => b.created_at.localeCompare(a.created_at))
}

/**
 * Normaliza um título de tarefa para comparação de duplicidade/busca
 * case-insensitive, ignorando acentos e espaços extras. Ex.: "Lavar louça",
 * "lavar louca" e "Lavar  Louça " viram a mesma chave — usado no autocomplete
 * e no soft block do ADMIN (client) e no guard server de `createTask`.
 *
 * O módulo também concentra a **busca por combinação de palavras** do
 * autocomplete ("Você quis dizer..."): as palavras do título funcionam como
 * tags — a ordem não importa, cada palavra da busca com 3+ caracteres precisa
 * aparecer no título (exata, no início ou como trecho: "quar" → "quartos",
 * "zin" → "cozinha") e as candidatas saem da melhor combinação para a pior.
 */
export function normalizeTaskTitle(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Regra do produto: cada palavra da busca precisa ter 3 caracteres ou mais. */
export const MIN_MATCH_WORD_LENGTH = 1

/**
 * Palavras pesquisáveis de um texto (já normalizado): minúsculas, sem acentos e
 * apenas as com `MIN_MATCH_WORD_LENGTH`+ caracteres. Palavras curtas ("o", "e",
 * "de") são deixadas de fora de propósito — combiná-las geraria falso positivo.
 */
export function searchWords(value: string): string[] {
  return normalizeTaskTitle(value)
    .split(' ')
    .filter((word) => word.length >= MIN_MATCH_WORD_LENGTH)
}

/** Palavra do título idêntica ao termo da busca ("varrer" = "Varrer"). */
const WORD_EXACT = 3
/** O termo é o início da palavra ("quar" em "quartos"). */
const WORD_PREFIX = 2
/** O termo aparece dentro da palavra ("zin" em "cozinha"). */
const WORD_INSIDE = 1

function wordQuality(word: string, term: string): number {
  if (word === term) return WORD_EXACT
  if (word.startsWith(term)) return WORD_PREFIX
  if (word.includes(term)) return WORD_INSIDE
  return 0
}

/** Quão boa é a combinação entre o título e os termos da busca. */
export type TaskTitleRank = {
  /** Soma da qualidade das palavras que casaram (exata > prefixo > trecho). */
  quality: number
  /** Nº de palavras do título — quanto menos, mais específica a combinação. */
  wordCount: number
  /** Posição da primeira palavra que casou (desempata a posição no título). */
  firstMatch: number
}

/**
 * Pontua um título contra os termos da busca. Devolve `null` quando **falta
 * alguma** palavra da combinação — a busca só devolve títulos que atendem a
 * busca inteira, senão "varrer sala" puxaria "Varrer a cozinha" junto.
 */
export function rankTaskTitle(
  title: string | null | undefined,
  terms: string[]
): TaskTitleRank | null {
  if (!title || terms.length === 0) return null

  const words = normalizeTaskTitle(title).split(' ').filter(Boolean)
  if (words.length === 0) return null

  let quality = 0
  let firstMatch = words.length

  for (const term of terms) {
    let best = 0
    let bestIndex = words.length

    words.forEach((word, index) => {
      const wordMatch = wordQuality(word, term)
      if (wordMatch > best) {
        best = wordMatch
        bestIndex = index
      }
    })

    if (best === 0) return null
    quality += best
    if (bestIndex < firstMatch) firstMatch = bestIndex
  }

  return { quality, wordCount: words.length, firstMatch }
}

/** Melhor primeiro: mais palavra exata > título mais curto > casa mais na frente. */
function compareRanks(a: TaskTitleRank, b: TaskTitleRank): number {
  if (a.quality !== b.quality) return b.quality - a.quality
  if (a.wordCount !== b.wordCount) return a.wordCount - b.wordCount
  return a.firstMatch - b.firstMatch
}

/**
 * Autocomplete por **combinação de palavras**: dado o que o ADMIN digitou
 * ("quarto limpar"), devolve até `limit` itens do catálogo que têm **todas** as
 * palavras da busca, independentemente da ordem, do melhor para o pior
 * ("Limpar todo o Quarto"). Termos incompletos valem ("ozi" → "cozinha").
 *
 * Cada palavra da busca precisa de 3+ caracteres; sem nenhuma palavra válida
 * (`"a b c"`, por ex.) não há sugestão. Genérico no item para não acoplar ao
 * tipo `Task` (client e servidor podem usar a mesma regra).
 */
export function searchTasksByWords<T>(
  query: string,
  items: T[],
  getTitle: (item: T) => string | null | undefined,
  limit = 3
): T[] {
  const terms = searchWords(query)
  if (terms.length === 0) return []

  return items
    .map((item, index) => ({
      item,
      index,
      rank: rankTaskTitle(getTitle(item), terms),
    }))
    .filter((entry): entry is { item: T; index: number; rank: TaskTitleRank } =>
      entry.rank !== null
    )
    .sort(
      (a, b) => compareRanks(a.rank, b.rank) || a.index - b.index
    )
    .slice(0, limit)
    .map((entry) => entry.item)
}

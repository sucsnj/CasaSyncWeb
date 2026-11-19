/**
 * Módulo puro da FILA DE ALERTAS BLOQUEANTES do DEPENDENTE.
 *
 * A fila é **única** e obedece FIFO: tudo o que exige confirmação do dependente
 * (comunicados publicados e o alerta de penalização) entra na mesma fila, um por
 * vez. O alerta de penalização **não tem prioridade** — segue a ordem natural,
 * do item mais antigo para o mais novo, seja comunicado ou penalização.
 *
 * - A ordem é a idade do item (`createdAt`): o comunicado usa `created_at` e a
 *   penalização o `created_at` da notificação. Empate mantém a ordem de
 *   entrada (`Array.prototype.sort` é estável desde o ES2019).
 * - Nada aqui é específico de tela: é a regra de ordenação/validação consumida
 *   pelo overlay e pelo servidor (`actions/comunicados.ts`), que revalida a
 *   confirmação por digitação — a UI sozinha não é garantia de leitura.
 *
 * Confirmação por digitação (regra do usuário): para confirmar um COMUNICADO o
 * dependente precisa digitar ao menos `ALERT_TYPED_WORDS_REQUIRED` palavras do
 * próprio aviso (título OU descrição), sem diferenciar caixa e sem acento. A
 * penalização não exige digitação (regra exclusiva dos comunicados).
 */

import type { DueComunicado } from '@/utils/comunicados'
import type { NotificationRow } from '@/types/notifications'

/** Quantas palavras do comunicado o dependente precisa digitar. */
export const ALERT_TYPED_WORDS_REQUIRED = 3

/**
 * Mínimo de palavras "de conteúdo" (4+ letras) que um comunicado precisa ter para
 * ser publicável — garante material suficiente para o desafio diário.
 */
export const COMUNICADO_MIN_WORDS = 7

/**
 * Tamanho mínimo (em letras) de uma palavra para entrar no desafio diário.
 */
export const COMUNICADO_TARGET_MIN_WORD_LENGTH = 4
export const COMUNICADO_TARGET_COUNT = 3

/**
 * Palavra com menos de 2 letras não conta. Sem esse piso, "o a de" (3 preposições
 * de qualquer comunicado) valeria como leitura conferida — o piso mantém o
 * desafio em palavras que carregam o conteúdo do aviso.
 */
export const ALERT_TYPED_MIN_WORD_LENGTH = 2

/** Alerta de penalização extraído da notificação `PENALTY`. */
export type PenaltyAlert = {
  id: string
  createdAt: string
  title: string
  /** "−10 pt(s)" (texto exibido em destaque no card). */
  points: string
  /** "Motivo: ..." (texto exibido abaixo do valor). */
  reason: string
}

export type AlertQueueItem =
  | ({ kind: 'comunicado' } & DueComunicado)
  | ({ kind: 'penalty' } & PenaltyAlert)

/** Normaliza texto para comparação: sem acento, minúsculo, só letras/números. */
export function normalizeAlertText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Palavras "de conteúdo" de um texto (normalizado, com o piso de tamanho). */
export function alertWords(text: string): string[] {
  return normalizeAlertText(text)
    .split(' ')
    .filter((word) => word.length >= ALERT_TYPED_MIN_WORD_LENGTH)
}

/** Palavras digitadas que existem no comunicado (sem repetir). */
export function matchedAlertWords(typed: string, source: string): string[] {
  const sourceWords = new Set(alertWords(source))
  const matched = new Set<string>()
  for (const word of alertWords(typed)) {
    if (sourceWords.has(word)) matched.add(word)
  }
  return [...matched]
}

/**
 * Conta quantas das palavras digitadas (que existem no comunicado) NÃO fazem
 * parte de uma sequência de 2+ palavras consecutivas do comunicado. Palavras
 * que aparecem adjacentes a outra palavra digitada no texto não contabilizam.
 */
export function countNonConsecutiveTypedWords(
  typed: string,
  title: string,
  description: string
): number {
  const sourceWords = alertWords(`${title} ${description}`)
  const matched = new Set(matchedAlertWords(typed, `${title} ${description}`))
  // Palavras que participam de alguma sequência (adjacentes a outra digitada).
  const inSequence = new Set<string>()
  for (let i = 0; i < sourceWords.length; i++) {
    if (!matched.has(sourceWords[i])) continue
    const prevMatched =
      i > 0 && matched.has(sourceWords[i - 1])
    const nextMatched =
      i < sourceWords.length - 1 && matched.has(sourceWords[i + 1])
    if (prevMatched || nextMatched) {
      inSequence.add(sourceWords[i])
    }
  }
  let count = 0
  for (const word of matched) {
    if (!inSequence.has(word)) count++
  }
  return count
}

/**
 * Palavras "de conteúdo" (4+ letras) de um texto — base do desafio diário.
 */
export function alertTargetWords(text: string): string[] {
  return normalizeAlertText(text)
    .split(' ')
    .filter((word) => word.length >= COMUNICADO_TARGET_MIN_WORD_LENGTH)
}

function dailySeed(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function seededRandom(seed: number): () => number {
  let t = seed + 0x6d2b79f5
  return () => {
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Sorteia 3 posições (0-based) não consecutivas da lista filtrada, usando a data
 * como semente. O desafio muda a cada dia, mesmo com o mesmo texto.
 */
export function communicadoTargetPositions(
  title: string,
  description: string,
  date: string = new Date().toISOString().slice(0, 10),
  targetCount: number = COMUNICADO_TARGET_COUNT
): number[] {
  const words = alertTargetWords(`${title} ${description}`)
  const count = words.length
  if (count === 0) return []
  const requested = Math.max(1, Math.min(targetCount, count))
  if (count <= requested) return words.map((_, index) => index)

  const rng = seededRandom(dailySeed(`${date}|${words.join(' ')}`))
  const indices = words.map((_, index) => index)
  // Fisher-Yates determinístico.
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[indices[i], indices[j]] = [indices[j], indices[i]]
  }

  const chosen: number[] = []
  const chosenWords = new Set<string>()
  for (const index of indices) {
    if (chosen.length >= requested) break
    if (chosen.some((picked) => Math.abs(picked - index) === 1)) continue
    // Prefere palavras distintas quando possível.
    if (chosenWords.has(words[index]) && chosen.length < requested) {
      const remaining = count - chosen.length
      const needed = requested - chosen.length
      if (remaining > needed) continue
    }
    chosen.push(index)
    chosenWords.add(words[index])
  }

  if (chosen.length < requested) {
    for (let i = 0; i < count && chosen.length < requested; i++) {
      if (!chosen.includes(i)) chosen.push(i)
    }
  }

  return chosen.sort((a, b) => a - b)
}

/** Palavras sorteadas para o desafio do dia. */
export function communicadoTargetWords(
  title: string,
  description: string,
  date?: string,
  targetCount: number = COMUNICADO_TARGET_COUNT
): string[] {
  const words = alertTargetWords(`${title} ${description}`)
  return communicadoTargetPositions(title, description, date, targetCount).map(
    (index) => words[index]
  )
}

/** Texto da dica exibida ao dependente. */
export function communicadoTargetHint(
  title: string,
  description: string,
  date?: string,
  targetCount: number = COMUNICADO_TARGET_COUNT
): string {
  const words = alertTargetWords(`${title} ${description}`)
  const positions = communicadoTargetPositions(title, description, date, targetCount)
  if (positions.length === 0) return ''

  const labels = positions.map((index) => {
    if (index === words.length - 1) return 'a última palavra'
    return `a ${index + 1}ª palavra`
  })

  if (labels.length === 1) {
    return `Para confirmar hoje, digite ${labels[0]} do aviso.`
  }
  return `Para confirmar hoje, digite ${labels
    .slice(0, -1)
    .join(', ')} e ${labels[labels.length - 1]} do aviso.`
}

/**
 * Regra de confirmação por digitação: o dependente precisa digitar as palavras
 * sorteadas para o dia (posições variam diariamente).
 */
export function hasTypedAlertConfirmation(
  typed: string,
  title: string,
  description: string,
  date: string = new Date().toISOString().slice(0, 10),
  targetCount: number = COMUNICADO_TARGET_COUNT
): boolean {
  const targets = communicadoTargetWords(title, description, date, targetCount)
  if (targets.length === 0) return false
  const typedWords = normalizeAlertText(typed).split(' ').filter(Boolean)
  let matched = 0
  for (const word of typedWords) {
    if (matched < targets.length && word === targets[matched]) {
      matched++
    }
  }
  return matched === targets.length
}

/** Penalidade ainda não lida (a fila só mostra o que o dependente não viu). */
export function isPendingPenalty(notification: NotificationRow): boolean {
  return notification.type === 'PENALTY' && !notification.read_at
}

/**
 * "-X pt(s) · Motivo: Y" → valor em destaque + motivo. O corpo é montado em
 * `updateDependentPoints`; o fallback cobre corpo fora do formato.
 */
export function parsePenaltyAlert(notification: NotificationRow): PenaltyAlert {
  const body = notification.body ?? ''
  const pointsMatch = body.match(/^(-?\d+\s*pt\(s\))/)
  const reasonMatch = body.match(/Motivo:\s*(.+)$/)

  return {
    id: notification.id,
    createdAt: notification.created_at,
    title: notification.title,
    points: pointsMatch ? pointsMatch[1].trim() : body.split('·')[0]?.trim() ?? '',
    reason: reasonMatch
      ? reasonMatch[1].trim()
      : body.split('Motivo:')[1]?.trim() ?? body,
  }
}

export function toPenaltyAlertItem(notification: NotificationRow): AlertQueueItem {
  return { kind: 'penalty', ...parsePenaltyAlert(notification) }
}

export function toComunicadoAlertItem(due: DueComunicado): AlertQueueItem {
  return { kind: 'comunicado', ...due }
}

/** FIFO: mais antigo primeiro; empate de `createdAt` mantém a ordem de entrada. */
export function sortAlertQueue(items: AlertQueueItem[]): AlertQueueItem[] {
  return [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}
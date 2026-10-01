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
 * Regra de confirmação por digitação: `>= 3` palavras do comunicado, em qualquer
 * ordem, ignorando repetição, caixa e acento. Usada na UI (habilita o botão) e
 * na action (fail-closed — o cliente não é confiar).
 */
export function hasTypedAlertConfirmation(
  typed: string,
  title: string,
  description: string
): boolean {
  return (
    matchedAlertWords(typed, `${title} ${description}`).length >=
    ALERT_TYPED_WORDS_REQUIRED
  )
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
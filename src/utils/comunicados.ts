/**
 * Módulo puro dos COMUNICADOS (avisos da casa publicados pelo ADMIN).
 *
 * Regras de negócio (confirmadas com o usuário):
 * - SEM tempo real (decisão de produto): o comunicado só é exibido no render
 *   server-side das telas do dependente — na atualização da página, troca de
 *   endpoint ou após confirmar. Não há Realtime nem sinal por notificação.
 * - A 1ª exibição respeita a agenda (não é imediata): aparece no primeiro
 *   slot agendado (dia da semana + horário em America/Recife) a partir do
 *   momento da publicação — um horário futuro não é "adiantado".
 * - Repetição é POR DEPENDENTE: cada confirmação agenda a próxima exibição
 *   conforme o período (dias), os dias da semana e o horário configurados;
 *   quando o dependente completa `repeats_total` confirmações, para de receber.
 * - O "disparo" agendado é calculado no servidor (próxima abertura) — o app
 *   não usa cron/background.
 *
 * O fuso de referência do agendamento é America/Recife (UTC-3 fixo, sem DST) —
 * mesmo fuso que o `registerLoginDay` usa para os dias de acesso. Horários de
 * parede digitados pelo ADMIN viram instantes comparáveis via offset fixo.
 */

import type { Tables } from '@/types/database'

export const COMUNICADO_MAX_REPEATS = 100
export const COMUNICADO_MAX_INTERVAL_DAYS = 365

export const COMUNICADO_DAY_LABELS = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
] as const

export const COMUNICADO_SHORT_DAY_LABELS = [
  'Dom',
  'Seg',
  'Ter',
  'Qua',
  'Qui',
  'Sex',
  'Sáb',
] as const

export const COMUNICADO_DEFAULT_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6]
export const COMUNICADO_DEFAULT_TIME = '08:00'

export type Comunicado = Tables<'comunicados'>

/** Comunicado que o dependente precisa confirmar agora (view da fila/exibição). */
export type DueComunicado = {
  id: string
  title: string
  description: string
  repeatsTotal: number
  deliveredCount: number
  remaining: number
}

export function toDueComunicado(
  comunicado: Comunicado,
  deliveredCount: number
): DueComunicado {
  return {
    id: comunicado.id,
    title: comunicado.title,
    description: comunicado.description,
    repeatsTotal: comunicado.repeats_total,
    deliveredCount,
    remaining: Math.max(0, comunicado.repeats_total - deliveredCount),
  }
}

export function comunicadoSchedule(comunicado: Comunicado): ComunicadoSchedule {
  return {
    repeatsTotal: comunicado.repeats_total,
    repeatIntervalDays: comunicado.repeat_interval_days,
    repeatWeekdays: comunicado.repeat_weekdays,
    repeatTime: comunicado.repeat_time,
  }
}

/**
 * Offset fixo de America/Recife: local = UTC − 3h, logo `UTC = local + 3h`.
 * Sem DST, então a conversão é linear (dura para todo o ano).
 */
const RECIFE_UTC_OFFSET_MS = 3 * 60 * 60 * 1000

/** HH:MM de 24h (ex.: "08:00", "14:30"). */
export const COMUNICADO_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

export type ComunicadoSchedule = {
  repeatsTotal: number
  repeatIntervalDays: number
  repeatWeekdays: number[]
  repeatTime: string
}

function hourMinute(time: string): { hour: number; minute: number } {
  const [hour, minute] = time.split(':').map(Number)
  return { hour, minute }
}

/** "08:00:00" (time do Postgres) → "08:00" exibível. */
export function formatComunicadoTime(time: string): string {
  return time.slice(0, 5)
}

/** Dia da semana (0=domingo..6=sábado) que um instante tem em America/Recife. */
export function recifeWeekday(instant: Date): number {
  return new Date(instant.getTime() + RECIFE_UTC_OFFSET_MS).getUTCDay()
}

/**
 * Próxima ocorrência agendada de um comunicado, DADO o instante da última
 * confirmação (`after`):
 *
 *   referência = after + repeatIntervalDays (ou `after` se 0)
 *   candidato   = primeiro instante >= referência cujo dia da semana está em
 *                 `repeatWeekdays` e cujo relógio local (Recife) é `HH:MM`
 *
 * O helper agenda a 1ª exibição e as repetições. Para a 1ª, o chamador passa
 * uma agenda com `repeatIntervalDays: 0` e `after` = momento da publicação:
 * o resultado é o primeiro slot (dia da semana + horário) >= a publicação. As
 * repetições seguem com `after` = última confirmação e intervalo real.
 */
export function nextComunicadoOccurrence(
  after: Date,
  schedule: ComunicadoSchedule
): Date {
  const { hour, minute } = hourMinute(schedule.repeatTime)
  const weekdays = schedule.repeatWeekdays.length > 0
    ? schedule.repeatWeekdays
    : COMUNICADO_DEFAULT_WEEKDAYS

  let reference = after
  if (schedule.repeatIntervalDays > 0) {
    reference = new Date(after.getTime() + schedule.repeatIntervalDays * 86_400_000)
  }

  // Candidato de hoje em horário de parede (Recife): converte a meia-noite local
  // para instante (subtrai o offset fixo) e soma o horário configurado.
  const shift = reference.getTime() + RECIFE_UTC_OFFSET_MS
  const wall = new Date(shift)
  let candidateMs =
    Date.UTC(
      wall.getUTCFullYear(),
      wall.getUTCMonth(),
      wall.getUTCDate(),
      hour,
      minute,
      0,
      0
    ) - RECIFE_UTC_OFFSET_MS

  if (candidateMs <= reference.getTime()) {
    candidateMs += 86_400_000
  }

  // Avança de dia em dia (no máx. 8) até cair num dia da semana permitido.
  for (let i = 0; i < 8; i++) {
    const candidate = new Date(candidateMs)
    if (weekdays.includes(recifeWeekday(candidate))) {
      return candidate
    }
    candidateMs += 86_400_000
  }

  return new Date(candidateMs)
}

/** Fuso do agendamento, exposto para testes/registro. */
export function recifeOffsetHours(): number {
  return RECIFE_UTC_OFFSET_MS / 3_600_000
}
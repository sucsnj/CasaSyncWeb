/**
 * Módulo puro dos COMUNICADOS (avisos da casa publicados pelo ADMIN).
 *
 * Regras de negócio (confirmadas com o usuário):
 * - SEM tempo real (decisão de produto): o comunicado só é exibido no render
 *   server-side das telas do dependente — na atualização da página, troca de
 *   endpoint ou após confirmar. Não há Realtime nem sinal por notificação.
 * - 1ª exibição em "slot de hoje ou próximo" (regra do usuário): num dia
 *   agendado, se o horário de hoje já passou o comunicado aparece de imediato
 *   no próximo render; se ainda não chegou, espera o horário de hoje. Num dia
 *   não agendado, aparece no próximo dia agendado. O intervalo de repetição
 *   não conta nesse primeiro ciclo.
 * - Repetição é POR DEPENDENTE: cada confirmação agenda a próxima exibição
 *   conforme o período (dias), os dias da semana e o horário configurados;
 *   quando o dependente completa `repeats_total` confirmações, para de receber.
 * - Para confirmar, o dependente digita ao menos 3 palavras do aviso (regra de
 *   leitura conferida — helper em `utils/alert-queue.ts`, revalidado no servidor).
 * - O "disparo" agendado é calculado no servidor (próxima abertura) — o app
 *   não usa cron/background.
 *
 * O fuso do agendamento é o **fuso da casa** (chave `house_timezone`, nome IANA,
 * default `America/Recife`) — o mesmo que o `registerLoginDay` usa para os dias de
 * acesso. Horários de parede digitados pelo ADMIN viram instantes comparáveis via
 * `Intl` (`utils/timezone.ts`), que também considera horário de verão.
 */

import { zonedOffsetMs, zonedWallClockToInstant, zonedWeekday } from '@/utils/timezone'
import type { Tables } from '@/types/database'

export const COMUNICADO_MAX_REPEATS = 100
export const COMUNICADO_MAX_INTERVAL_DAYS = 365

/**
 * Descrição é o texto que o dependente lê antes de confirmar: mínimo de 30
 * caracteres (aviso de uma linha não justifica confirmação por digitação) e
 * máximo de 500.
 */
export const COMUNICADO_MIN_DESCRIPTION = 30
export const COMUNICADO_MAX_DESCRIPTION = 500

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
  /**
   * `created_at` do comunicado: é o que ordena a fila de alertas (FIFO, junto
   * com o alerta de penalização) — ver `utils/alert-queue.ts`.
   */
  createdAt: string
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
    createdAt: comunicado.created_at,
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

/**
 * Instante do "slot" (HH:MM no fuso da casa) do mesmo dia-calendário de
 * `instant` naquele fuso. Usado como candidato inicial das ocorrências.
 */
function slotOf(instant: Date, time: string, timeZone: string): number {
  const { hour, minute } = hourMinute(time)
  // Dia-calendário (na casa) de `instant`: desloca pelo offset do fuso e lê os
  // campos UTC. O slot HH:MM desse dia vira o instante equivalente via
  // `Intl` (uma-passagem com refinamento, para a borda de DST).
  const shifted = new Date(instant.getTime() + zonedOffsetMs(instant, timeZone))
  return zonedWallClockToInstant(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
    hour,
    minute,
    timeZone
  ).getTime()
}

/**
 * Próxima ocorrência agendada de um comunicado, DADO o instante da última
 * confirmação (`after`) e o fuso da casa:
 *
 *   referência = after + repeatIntervalDays (ou `after` se 0)
 *   candidato   = primeiro instante >= referência cujo dia da semana está em
 *                 `repeatWeekdays` e cujo relógio local é `HH:MM`
 *
 * Usado para as REPETIÇÕES (`after` = última confirmação e intervalo real).
 * Para a 1ª exibição use `firstComunicadoOccurrence` (regra "slot de hoje ou
 * próximo").
 */
export function nextComunicadoOccurrence(
  after: Date,
  schedule: ComunicadoSchedule,
  timeZone: string
): Date {
  const weekdays = schedule.repeatWeekdays.length > 0
    ? schedule.repeatWeekdays
    : COMUNICADO_DEFAULT_WEEKDAYS

  let reference = after
  if (schedule.repeatIntervalDays > 0) {
    reference = new Date(after.getTime() + schedule.repeatIntervalDays * 86_400_000)
  }

  let candidateMs = slotOf(reference, schedule.repeatTime, timeZone)
  if (candidateMs <= reference.getTime()) {
    candidateMs += 86_400_000
  }

  // Avança de dia em dia (no máx. 8) até cair num dia da semana permitido.
  for (let i = 0; i < 8; i++) {
    const candidate = new Date(candidateMs)
    if (weekdays.includes(zonedWeekday(candidate, timeZone))) {
      return candidate
    }
    candidateMs += 86_400_000
  }

  return new Date(candidateMs)
}

/**
 * "Deadline" da 1ª exibição de um comunicado (regra "slot de hoje ou próximo",
 * definida pelo usuário), no fuso da casa:
 *
 * - hoje é dia agendado e o horário de hoje ainda não chegou → o aviso espera
 *   o horário de hoje (retorna o slot de hoje);
 * - hoje é dia agendado e o horário de hoje já passou → o aviso aparece logo
 *   no próximo render (retorna `now`);
 * - hoje NÃO é dia agendado → próximo dia agendado (retorna o slot desse dia).
 *
 * O intervalo de repetição não conta no primeiro ciclo.
 */
export function firstComunicadoOccurrence(
  now: Date,
  schedule: ComunicadoSchedule,
  timeZone: string
): Date {
  const weekdays = schedule.repeatWeekdays.length > 0
    ? schedule.repeatWeekdays
    : COMUNICADO_DEFAULT_WEEKDAYS

  if (weekdays.includes(zonedWeekday(now, timeZone))) {
    const todaySlotMs = slotOf(now, schedule.repeatTime, timeZone)
    return now.getTime() >= todaySlotMs
      ? new Date(now.getTime())
      : new Date(todaySlotMs)
  }

  return nextComunicadoOccurrence(
    now,
    { ...schedule, repeatIntervalDays: 0 },
    timeZone
  )
}
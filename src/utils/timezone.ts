/**
 * FUSO HORÁRIO DA CASA — módulo puro (sem `'use server'`, sem Supabase).
 *
 * A casa escolhe o fuso em Configurações (chave `house_timezone`, nome IANA). Ele
 * é usado em dois lugares que antes tinham `America/Recife` **hardcoded**:
 *
 * - o **agendamento dos comunicados** (`utils/comunicados.ts`): `repeat_time` é
 *   hora de parede da casa, então o instante do disparo depende do fuso;
 * - o **dia de acesso** (`actions/stats.ts`, métrica de streak): o dia que conta
 *   muda quando a casa está em outro fuso.
 *
 * Antes o cálculo era um offset fixo de −3h (Recife não tem DST). Com fuso
 * configurável o offset passa a ser **calculado por `Intl`** a cada instante,
 * o que também passa a lidar com horário de verão — algo que o offset fixo nunca
 * fez.
 *
 * Sem dependência externa: `Intl.DateTimeFormat` faz todo o trabalho.
 */

/** Fuso usado quando a casa nunca configurou (ou configurou algo inválido). */
export const DEFAULT_HOUSE_TIMEZONE = 'America/Recife'

/**
 * Fusos oferecidos no seletor. BR primeiro (o produto é pt-BR), depois alguns
 * externos common. O `value` é o nome IANA que o `Intl` entende; a validação do
 * servidor NÃO depende desta lista (usa o próprio `Intl`), então um fuso fora
 * dela nunca quebra — apenas não aparece na UI.
 */
export const HOUSE_TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: 'America/Sao_Paulo', label: 'São Paulo / Brasília (BRT)' },
  { value: 'America/Bahia', label: 'Salvador (BRT)' },
  { value: 'America/Fortaleza', label: 'Fortaleza (BRT)' },
  { value: 'America/Recife', label: 'Recife (BRT)' },
  { value: 'America/Araguaina', label: 'Palmas / Araguaína (BRT)' },
  { value: 'America/Belem', label: 'Belém / Santarém (BRT)' },
  { value: 'America/Cuiaba', label: 'Cuiabá (AMT)' },
  { value: 'America/Campo_Grande', label: 'Campo Grande (AMT)' },
  { value: 'America/Porto_Velho', label: 'Porto Velho (AMT)' },
  { value: 'America/Boa_Vista', label: 'Boa Vista (AMT)' },
  { value: 'America/Manaus', label: 'Manaus (AMT)' },
  { value: 'America/Rio_Branco', label: 'Rio Branco (AMT)' },
  { value: 'America/Noronha', label: 'Fernando de Noronha (FNT)' },
  { value: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires' },
  { value: 'America/Bogota', label: 'Bogotá' },
  { value: 'America/Lima', label: 'Lima' },
  { value: 'America/Santiago', label: 'Santiago' },
  { value: 'Europe/Lisbon', label: 'Lisboa' },
  { value: 'UTC', label: 'UTC' },
]

/**
 * O nome é um fuso que o runtime entende? O guard é o próprio `Intl`: um valor
 * inválido lança no construtor. Usado pelo validator da Server Action
 * (fail-closed) — não é uma lista fechada, é o mesmo conjunto que o `Intl`
 * reconhece.
 */
export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim() === '') return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

/** Partes do instante no fuso da casa (campos de relógio de parede). */
type ZonedParts = {
  year: number
  month: number // 1..12
  day: number // 1..31
  hour: number // 0..23
  minute: number
  second: number
}

function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)

  const read = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0)

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  }
}

/**
 * Quanto o fuso da casa está **à frente** de UTC, no instante dado (em ms).
 * Positivo parafusos a oeste (BRT = −3h ⇒ −10800000). Calculado por `Intl`
 * (logo, já considera DST) e truncado ao segundo, porque o fuso só muda em
 * segunda-granularidade.
 */
export function zonedOffsetMs(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone)
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000
}

/**
 * Converte um **relógio de parede** da casa (ano/mês/dia/hora/minuto) no instante
 * UTC correspondente.
 *
 * Two-pass: o primeiro chute usa o offset do instante aproximado e o segundo
 * refina com o offset do resultado — o par é o que resolve a borda de DST (o
 * instante resultante pode cair em outro offset que o chute). Para fusos sem DST
 * (o caso do Brasil hoje) a segunda passagem devolve o mesmo offset.
 */
export function zonedWallClockToInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0, 0)

  const firstOffset = zonedOffsetMs(new Date(guess), timeZone)
  const firstPass = new Date(guess - firstOffset)

  const secondOffset = zonedOffsetMs(firstPass, timeZone)
  if (secondOffset !== firstOffset) {
    return new Date(guess - secondOffset)
  }
  return firstPass
}

/**
 * Offset do fuso no formato curto de exibição (`"UTC-03:00"`, `"UTC+01:00"`).
 *
 * Usado na tela de Configurações para deixar o fuso escolhido **visível**: como
 * o `<select>` só mostra o nome da cidade, o offset é o que muda na hora quando
 * o ADMIN troca o fuso. É calculado com `zonedOffsetMs`, então já respeita o
 * horário de verão do fuso (Brasília não tem DST hoje; Lisboa tem).
 */
export function formatZonedOffset(
  timeZone: string,
  instant: Date = new Date()
): string {
  const offsetMs = zonedOffsetMs(instant, timeZone)
  const sign = offsetMs < 0 ? '-' : '+'
  const totalMinutes = Math.round(Math.abs(offsetMs) / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  return `UTC${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

/**
 * Dia da semana (0=domingo .. 6=sábado) que o instante tem **no fuso da casa**.
 * Mesmo truque do código anterior (desloca o instante pelo offset e lê o campo UTC
 * de dia), só que o offset agora é calculado em vez de fixo em +3h.
 */
export function zonedWeekday(instant: Date, timeZone: string): number {
  const shifted = new Date(instant.getTime() + zonedOffsetMs(instant, timeZone))
  return shifted.getUTCDay()
}

/**
 * Dia-calendário (`YYYY-MM-DD`) que o instante tem no fuso da casa.
 * `offsetDays` serve para "ontem"/"amanhã" na regra de streak.
 */
export function zonedDay(
  timeZone: string,
  offsetDays = 0,
  now: Date = new Date()
): string {
  const target = new Date(now.getTime() + offsetDays * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(target)
}
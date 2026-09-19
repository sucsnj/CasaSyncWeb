/**
 * Conversões de data/hora do prazo das tarefas.
 *
 * O campo `<input type="datetime-local">` produz um valor SEM fuso horário
 * ("YYYY-MM-DDTHH:mm") — a hora de parede *local* do usuário. O banco guarda
 * `tasks.due_date` como `timestamptz`; uma string naive gravada direto é
 * interpretada pelo Postgres no fuso da sessão (Supabase: UTC), e um prazo
 * escolhido em America/Recife (UTC-3) vira um instante 3 horas adiantado.
 *
 * Regra adotada: o CLIENTE converte o valor naive para o instante UTC correto
 * (`datetimeLocalToIso`) ANTES de enviar ao servidor, e o SERVIDOR só aceita
 * strings com fuso (guarda em `src/actions/tasks.ts`). Em tela, o instante do
 * banco volta para a hora de parede local com `isoToDateTimeLocalValue`.
 */

/** Padrão de `datetime-local`: fecha na precisão de minuto (opcional segundos). */
const NAIVE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/

/** Detecta fuso embutido no fim da string (Z ou ±HH:MM). */
const HAS_ZONE_DESIGNATOR = /(?:[zZ]|[+-]\d{2}:?\d{2})$/

function formatWall(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * Converte um valor `datetime-local` (naive) no instante UTC equivalente no
 * fuso local do cliente, como ISO 8601 com `Z`. Retorna `null` se vazio ou
 * inválido.
 *
 * Por que `new Date(naive)` funciona aqui: o spec do ECMAScript trata strings
 * de data/hora sem designador de fuso como hora LOCAL — o browser resolve o
 * fuso/DST do próprio dispositivo. Nunca chamar no servidor (Node interpreta
 * como UTC e retornaria o instante errado); `typeof window` abaixo serve de
 * trava — a conversão só faz sentido no browser, que conhece o fuso do usuário.
 */
export function datetimeLocalToIso(value: string): string | null {
  if (!value) return null
  const trimmed = value.trim()

  // Já veio com fuso (ex.: instante do banco reutilizado): normaliza só.
  if (HAS_ZONE_DESIGNATOR.test(trimmed)) {
    const ms = new Date(trimmed).getTime()
    return Number.isNaN(ms) ? null : new Date(ms).toISOString()
  }

  if (!NAIVE_PATTERN.test(trimmed)) return null
  if (typeof window === 'undefined') return null

  const ms = new Date(trimmed).getTime()
  return Number.isNaN(ms) ? null : new Date(ms).toISOString()
}

/** ISO do banco (timestamptz) → valor aceito por `<input type="datetime-local">`. */
export function isoToDateTimeLocalValue(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return formatWall(date)
}

/** Agora em formato aceito por `<input type="datetime-local">`. */
export function nowDateTimeLocalValue(): string {
  return formatWall(new Date())
}

/** Soma dias/horas a um valor `datetime-local` (base: agora se vazio). */
export function modifyDateTimeLocal(value: string, days = 0, hours = 0): string {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) return nowDateTimeLocalValue()
  date.setDate(date.getDate() + days)
  date.setHours(date.getHours() + hours)
  return formatWall(date)
}
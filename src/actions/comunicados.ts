'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/utils/supabase/admin'
import {
  getActiveAdminHouse,
  getDependentHouse,
  getSessionProfile,
} from '@/utils/house'
import {
  COMUNICADO_MAX_DESCRIPTION,
  COMUNICADO_MAX_INTERVAL_DAYS,
  COMUNICADO_MAX_REPEATS,
  COMUNICADO_MIN_DESCRIPTION,
  COMUNICADO_TIME_PATTERN,
  comunicadoSchedule,
  currentComunicadoOccurrence,
  firstComunicadoOccurrence,
  isComunicadoUnlimited,
  nextComunicadoOccurrence,
  skipMissedComunicadoOccurrences,
  toDueComunicado,
  type Comunicado,
  type DueComunicado,
} from '@/utils/comunicados'
import {
  alertTargetWords,
  COMUNICADO_MIN_WORDS,
  COMUNICADO_TARGET_MIN_WORD_LENGTH,
  hasComunicadoConfirmation,
} from '@/utils/alert-queue'
import { getHouseTimezoneSettings, getHouseComunicadoConfirmationSettings } from '@/utils/house-settings'
import type { ActionResult } from './types'

/**
 * Verifica (via service role) que o ADMIN controla a casa ativa como membro
 * `house_members.role='ADMIN'`. Autorização sempre deriva da sessão.
 */
async function assertAdminCanManage(
  admin: ReturnType<typeof createAdminClient>,
  houseId: string
): Promise<{ ok: true; adminId: string } | { ok: false; error: string }> {
  const { user, profile } = await getSessionProfile()

  if (!user || profile?.user_role !== 'ADMIN') {
    return { ok: false, error: 'Apenas administradores podem executar esta ação.' }
  }

  const { data: membership } = await admin
    .from('house_members')
    .select('id')
    .eq('house_id', houseId)
    .eq('profile_id', user.id)
    .eq('role', 'ADMIN')
    .maybeSingle()

  if (!membership) {
    return { ok: false, error: 'Casa não encontrada ou sem permissão.' }
  }

  return { ok: true, adminId: user.id }
}

function validateComunicadoFields(input: {
  title: string
  description: string
  repeatsTotal: number
  repeatIntervalDays: number
  repeatWeekdays: number[]
  repeatTime: string
  confirmationAnswers?: string[]
  confirmationCorrectIndex?: number | null
  confirmationWrongPoints?: number
}): string | null {
  if (!input.title.trim()) return 'Informe o título do comunicado.'
  if (input.title.trim().length > 120) {
    return 'Título muito longo (máximo 120 caracteres).'
  }
  const descriptionLength = input.description.trim().length
  if (descriptionLength < COMUNICADO_MIN_DESCRIPTION) {
    return `A descrição precisa de pelo menos ${COMUNICADO_MIN_DESCRIPTION} caracteres (tem ${descriptionLength}).`
  }
  if (descriptionLength > COMUNICADO_MAX_DESCRIPTION) {
    return `Descrição muito longa (máximo ${COMUNICADO_MAX_DESCRIPTION} caracteres).`
  }
  const tokenCount = alertTargetWords(`${input.title} ${input.description}`).length
  if (tokenCount < COMUNICADO_MIN_WORDS) {
    return `A descrição precisa de pelo menos ${COMUNICADO_MIN_WORDS} palavras com ${COMUNICADO_TARGET_MIN_WORD_LENGTH}+ letras (tem ${tokenCount}).`
  }
  if (
    !Number.isInteger(input.repeatsTotal) ||
    input.repeatsTotal < 0 ||
    input.repeatsTotal > COMUNICADO_MAX_REPEATS
  ) {
    return `Quantas vezes cada dependente deve receber varia de 0 (sem limite) a ${COMUNICADO_MAX_REPEATS}.`
  }
  if (
    !Number.isInteger(input.repeatIntervalDays) ||
    input.repeatIntervalDays < 0 ||
    input.repeatIntervalDays > COMUNICADO_MAX_INTERVAL_DAYS
  ) {
    return `O período entre repetições deve ficar entre 0 e ${COMUNICADO_MAX_INTERVAL_DAYS} dias.`
  }
  const weekdays = input.repeatWeekdays
  if (
    !Array.isArray(weekdays) ||
    weekdays.length === 0 ||
    weekdays.some(
      (day) => !Number.isInteger(day) || day < 0 || day > 6
    )
  ) {
    return 'Selecione ao menos um dia da semana.'
  }
  if (new Set(weekdays).size !== weekdays.length) {
    return 'Dias da semana duplicados.'
  }
  if (!COMUNICADO_TIME_PATTERN.test(input.repeatTime)) {
    return 'Horário inválido: use o formato HH:MM.'
  }

  const answers = input.confirmationAnswers
  if (answers !== undefined) {
    const cleaned = answers.map((a) => a.trim()).filter(Boolean)
    if (cleaned.length < 2) {
      return 'Informe ao menos 2 respostas para a confirmação.'
    }
    const correct = input.confirmationCorrectIndex
    if (correct === null || correct === undefined || correct < 0 || correct >= cleaned.length) {
      return 'Marque exatamente uma resposta como correta.'
    }
  }
  const wrongPoints = input.confirmationWrongPoints
  if (wrongPoints !== undefined) {
    if (!Number.isInteger(wrongPoints) || wrongPoints < 0) {
      return 'Os pontos subtraídos por erro devem ser um inteiro >= 0.'
    }
  }
  return null
}

export type ComunicadoInput = {
  title: string
  description: string
  repeatsTotal: number
  repeatIntervalDays: number
  repeatWeekdays: number[]
  repeatTime: string
  confirmationAnswers?: string[]
  confirmationCorrectIndex?: number | null
  confirmationWrongPoints?: number
}

/**
 * ADMIN cria um comunicado (rascunho, `published = false`). Publicar é um passo
 * à parte (`setComunicadoPublished`); na publicação ele passa a ser "devido"
 * para os dependentes da casa conforme a 1ª exibição (regra "slot de hoje ou
 * próximo" — ver `getDueComunicados`).
 */
export async function createComunicado(
  input: ComunicadoInput
): Promise<ActionResult<{ comunicado: Comunicado }>> {
  const activeHouse = await getActiveAdminHouse()
  if (!activeHouse) return { ok: false, error: 'Crie ou selecione uma casa primeiro.' }

  const admin = createAdminClient()
  const auth = await assertAdminCanManage(admin, activeHouse.id)
  if (!auth.ok) return auth

  const validation = validateComunicadoFields(input)
  if (validation) return { ok: false, error: validation }

  const now = new Date().toISOString()
  const { data: comunicadoRow, error } = await admin
    .from('comunicados')
    .insert({
      house_id: activeHouse.id,
      created_by: auth.adminId,
      title: input.title.trim(),
      description: input.description.trim(),
      published: false,
      repeats_total: input.repeatsTotal,
      repeat_interval_days: input.repeatIntervalDays,
      repeat_weekdays: input.repeatWeekdays,
      repeat_time: input.repeatTime,
      confirmation_answers: input.confirmationAnswers
        ? input.confirmationAnswers.map((a) => a.trim()).filter(Boolean)
        : null,
      confirmation_correct_index: input.confirmationCorrectIndex ?? null,
      confirmation_wrong_points: input.confirmationWrongPoints ?? 0,
      created_at: now,
      updated_at: now,
    })
    .select('*')
    .single()

  if (error || !comunicadoRow) {
    return { ok: false, error: 'Falha ao criar o comunicado.' }
  }

  revalidatePath('/dashboard/admin/comunicados')
  return {
    ok: true,
    data: { comunicado: comunicadoRow },
    message: 'Comunicado criado como rascunho.',
  }
}

export type ComunicadoPatch = {
  title?: string
  description?: string
  repeatsTotal?: number
  repeatIntervalDays?: number
  repeatWeekdays?: number[]
  repeatTime?: string
  confirmationAnswers?: string[]
  confirmationCorrectIndex?: number | null
  confirmationWrongPoints?: number
}

/**
 * ADMIN edita um comunicado da casa ativa. A edição da agenda vale para as
 * próximas ocorrências; as confirmações já feitas são preservadas.
 */
export async function updateComunicado(
  comunicadoId: string,
  patch: ComunicadoPatch
): Promise<ActionResult<{ comunicado: Comunicado }>> {
  const activeHouse = await getActiveAdminHouse()
  if (!activeHouse) return { ok: false, error: 'Selecione uma casa primeiro.' }

  const admin = createAdminClient()
  const auth = await assertAdminCanManage(admin, activeHouse.id)
  if (!auth.ok) return auth

  const { data: comunicado } = await admin
    .from('comunicados')
    .select('*')
    .eq('id', comunicadoId)
    .maybeSingle()

  if (!comunicado || comunicado.house_id !== activeHouse.id) {
    return { ok: false, error: 'Comunicado não encontrado nesta casa.' }
  }

  const validation = validateComunicadoFields({
    title: patch.title ?? comunicado.title,
    description: patch.description ?? comunicado.description,
    repeatsTotal: patch.repeatsTotal ?? comunicado.repeats_total,
    repeatIntervalDays: patch.repeatIntervalDays ?? comunicado.repeat_interval_days,
    repeatWeekdays: patch.repeatWeekdays ?? comunicado.repeat_weekdays,
    repeatTime: patch.repeatTime ?? comunicado.repeat_time,
    confirmationAnswers:
      patch.confirmationAnswers ?? comunicado.confirmation_answers ?? undefined,
    confirmationCorrectIndex:
      patch.confirmationCorrectIndex ?? comunicado.confirmation_correct_index,
    confirmationWrongPoints:
      patch.confirmationWrongPoints ?? comunicado.confirmation_wrong_points,
  })
  if (validation) return { ok: false, error: validation }

  // `.select('*')` devolve a linha já gravada (com o `.trim()` e o `updated_at`
  // do servidor) para o client reconciliar o card na hora: o Realtime nem
  // sempre entrega o próprio write, e sem isso o título/descrição editados só
  // apareciam no card depois do F5.
  const { data: updated, error } = await admin
    .from('comunicados')
    .update({
      ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
      ...(patch.description !== undefined ? { description: patch.description.trim() } : {}),
      ...(patch.repeatsTotal !== undefined ? { repeats_total: patch.repeatsTotal } : {}),
      ...(patch.repeatIntervalDays !== undefined
        ? { repeat_interval_days: patch.repeatIntervalDays }
        : {}),
      ...(patch.repeatWeekdays !== undefined
        ? { repeat_weekdays: patch.repeatWeekdays }
        : {}),
      ...(patch.repeatTime !== undefined ? { repeat_time: patch.repeatTime } : {}),
      ...(patch.confirmationAnswers !== undefined
        ? {
            confirmation_answers: patch.confirmationAnswers
              .map((a) => a.trim())
              .filter(Boolean),
          }
        : {}),
      ...(patch.confirmationCorrectIndex !== undefined
        ? { confirmation_correct_index: patch.confirmationCorrectIndex }
        : {}),
      ...(patch.confirmationWrongPoints !== undefined
        ? { confirmation_wrong_points: patch.confirmationWrongPoints }
        : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', comunicadoId)
    .select('*')
    .single()
  if (error || !updated) {
    return { ok: false, error: 'Falha ao salvar o comunicado.' }
  }

  revalidatePath('/dashboard/admin/comunicados')
  return {
    ok: true,
    data: { comunicado: updated },
    message: 'Comunicado atualizado.',
  }
}

/**
 * ADMIN publica/despublica um comunicado da casa ativa. Sem tempo real
 * (decisão de produto): os dependentes passam a vê-lo na próxima atualização
 * da tela ou troca de endpoint (`getDueComunicados()` no render); despublicar
 * os faz parar de receber nesses mesmos renders.
 */
export async function setComunicadoPublished(
  comunicadoId: string,
  published: boolean
): Promise<ActionResult> {
  const activeHouse = await getActiveAdminHouse()
  if (!activeHouse) return { ok: false, error: 'Selecione uma casa primeiro.' }

  const admin = createAdminClient()
  const auth = await assertAdminCanManage(admin, activeHouse.id)
  if (!auth.ok) return auth

  const { data: comunicado } = await admin
    .from('comunicados')
    .select('house_id, title, published, confirmation_answers, confirmation_correct_index')
    .eq('id', comunicadoId)
    .maybeSingle()

  if (!comunicado || comunicado.house_id !== activeHouse.id) {
    return { ok: false, error: 'Comunicado não encontrado nesta casa.' }
  }

  if (published) {
    const { getHouseComunicadoConfirmationSettings } = await import('@/utils/house-settings')
    const confirmationSettings = await getHouseComunicadoConfirmationSettings(activeHouse.id)
    if (confirmationSettings.mode === 'answers') {
      const answers = comunicado.confirmation_answers ?? []
      const correctIndex = comunicado.confirmation_correct_index
      const valid =
        answers.length >= 2 &&
        correctIndex !== null &&
        correctIndex !== undefined &&
        correctIndex >= 0 &&
        correctIndex < answers.length
      if (!valid) {
        return {
          ok: false,
          error: 'Configure ao menos 2 respostas e marque uma como correta antes de publicar.',
        }
      }
    }
  }

  const { error } = await admin
    .from('comunicados')
    .update({ published, updated_at: new Date().toISOString() })
    .eq('id', comunicadoId)
  if (error) return { ok: false, error: 'Falha ao alternar a publicação.' }

  revalidatePath('/dashboard/admin/comunicados')
  return {
    ok: true,
    message: published
      ? `Comunicado "${comunicado.title}" publicado — os dependentes verão conforme a agenda.`
      : 'Comunicado despublicado.',
  }
}

/**
 * ADMIN apaga um comunicado. As confirmações dos dependentes morrem junto
 * (`comunicado_deliveries.comunicado_id` é `on delete cascade`).
 */
export async function deleteComunicado(
  comunicadoId: string
): Promise<ActionResult> {
  const activeHouse = await getActiveAdminHouse()
  if (!activeHouse) return { ok: false, error: 'Selecione uma casa primeiro.' }

  const admin = createAdminClient()
  const auth = await assertAdminCanManage(admin, activeHouse.id)
  if (!auth.ok) return auth

  const { data: comunicado } = await admin
    .from('comunicados')
    .select('house_id, title')
    .eq('id', comunicadoId)
    .maybeSingle()

  if (!comunicado || comunicado.house_id !== activeHouse.id) {
    return { ok: false, error: 'Comunicado não encontrado nesta casa.' }
  }

  const { error } = await admin
    .from('comunicados')
    .delete()
    .eq('id', comunicadoId)
  if (error) return { ok: false, error: 'Falha ao excluir o comunicado.' }

  revalidatePath('/dashboard/admin/comunicados')
  return { ok: true, message: `Comunicado "${comunicado.title}" excluído.` }
}

/**
 * ADMIN zera o contador de confirmações de um comunicado da casa ativa. Todas as
 * entregas (`comunicado_deliveries`) voltam a `delivered_count = 0` com
 * `last_confirmed_at` e `last_occurrence_at` nulos, então os dependentes voltam
 * a receber o aviso (se publicado) como se fosse a primeira vez. O comunicado
 * em si não é alterado.
 */
export async function resetComunicadoConfirmations(
  comunicadoId: string
): Promise<ActionResult> {
  const activeHouse = await getActiveAdminHouse()
  if (!activeHouse) return { ok: false, error: 'Selecione uma casa primeiro.' }

  const admin = createAdminClient()
  const auth = await assertAdminCanManage(admin, activeHouse.id)
  if (!auth.ok) return auth

  const { data: comunicado } = await admin
    .from('comunicados')
    .select('house_id, title')
    .eq('id', comunicadoId)
    .maybeSingle()

  if (!comunicado || comunicado.house_id !== activeHouse.id) {
    return { ok: false, error: 'Comunicado não encontrado nesta casa.' }
  }

  const { error } = await admin
    .from('comunicado_deliveries')
    .update({
      delivered_count: 0,
      last_confirmed_at: null,
      last_occurrence_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('comunicado_id', comunicadoId)

  if (error) return { ok: false, error: 'Falha ao zerar as confirmações.' }

  revalidatePath('/dashboard/admin/comunicados')
  return {
    ok: true,
    message: `Confirmações de "${comunicado.title}" zeradas — os dependentes vão receber o aviso de novo.`,
  }
}

/**
 * Comunicados "devidos" do DEPENDENTE da própria casa (papel e casa derivados
 * da sessão — nunca de input público). SEM tempo real (decisão de produto):
 * usado no render server-side das telas do dependente — a fila só muda em
 * refresh/troca de endpoint (re-render) e após confirmar.
 *
 * 1ª exibição pela regra "slot de hoje ou próximo" (definida pelo usuário):
 * num dia agendado, horário de hoje já passou → devido já (próximo render);
 * horário de hoje ainda não chegou → deve esperar; hoje não é dia agendado →
 * próximo dia agendado.
 *
 * - sem linha de entrega (ou `last_occurrence_at` nulo) → devido quando
 *   `now >= firstComunicadoOccurrence` (slot de hoje ou próximo; intervalo
 *   ignorado na 1ª exibição);
 * - `repeats_total = 0` → sem limite: nunca encerra para o dependente;
 * - senão, `delivered_count >= repeats_total` → encerrado para este dependente;
 * - senão, devido quando `now >= próxima ocorrência` a partir da **ocorrência
 *   agendada** já tratada (`last_occurrence_at`, somando o intervalo). O
 *   `last_confirmed_at` é só auditoria: late confirmation não desloca a agenda.
 */
export async function getDueComunicados(): Promise<DueComunicado[]> {
  const { user, profile } = await getSessionProfile()
  if (!user || profile?.user_role !== 'DEPENDENT') return []

    const house = await getDependentHouse(user.id)
  if (!house) return []

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return []
  }

  const { data: comunicados } = await admin
    .from('comunicados')
    .select('*')
    .eq('house_id', house.id)
    .eq('published', true)
    .order('created_at', { ascending: true })

  if (!comunicados || comunicados.length === 0) return []

  const ids = comunicados.map((comunicado) => comunicado.id)
  const { data: deliveries } = await admin
    .from('comunicado_deliveries')
    .select(
      'comunicado_id, delivered_count, failed_attempts, last_confirmed_at, last_occurrence_at'
    )
    .eq('profile_id', user.id)
    .in('comunicado_id', ids)

  const deliveriesByComunicado = new Map(
    (deliveries ?? []).map((delivery) => [delivery.comunicado_id, delivery])
  )

  const now = new Date()
  const due: DueComunicado[] = []
  // Fuso da casa (chave `house_timezone`): `repeat_time` é hora de parede dela.
   const { timezone } = await getHouseTimezoneSettings(house.id)
   const confirmationSettings = await getHouseComunicadoConfirmationSettings(house.id)

   for (const comunicado of comunicados) {
    // Se a casa exige confirmação por respostas e o comunicado não tem respostas
    // válidas, despublica automaticamente e não exibe.
    if (confirmationSettings.mode === 'answers') {
      const answers = comunicado.confirmation_answers ?? []
      const correctIndex = comunicado.confirmation_correct_index
      const valid =
        answers.length >= 2 &&
        correctIndex !== null &&
        correctIndex !== undefined &&
        correctIndex >= 0 &&
        correctIndex < answers.length
      if (!valid) {
        await admin
          .from('comunicados')
          .update({ published: false, updated_at: new Date().toISOString() })
          .eq('id', comunicado.id)
        revalidatePath('/dashboard/admin/comunicados')
        continue
      }
    }

    const delivery = deliveriesByComunicado.get(comunicado.id)
    const deliveredCount = delivery?.delivered_count ?? 0

    // Sem limite (`repeats_total = 0`): nunca encerra para o dependente.
    if (!isComunicadoUnlimited(comunicado.repeats_total) && deliveredCount >= comunicado.repeats_total) continue

    const schedule = comunicadoSchedule(comunicado)

    // A **repetição** é ancorada na ocorrência agendada (`last_occurrence_at`),
    // não no instante em que o dependente confirmou: confirmar atrasado NÃO
    // desloca a agenda. O fallback para `last_confirmed_at` cobre linhas
    // anteriores à migração que criou a coluna.
    //
    // Sem âncora (por exemplo depois do "Zerar confirmações", que zera
    // `delivered_count`, `last_confirmed_at` e `last_occurrence_at`) é a 1ª
    // exibição do dependente: vale a regra "slot de hoje ou próximo" e o aviso
    // aparece assim que o horário do dia passa (ou no próximo dia agendado).
    const lastOccurrence = delivery?.last_occurrence_at
      ? new Date(delivery.last_occurrence_at)
      : delivery?.last_confirmed_at
        ? new Date(delivery.last_confirmed_at)
        : null

    if (lastOccurrence) {
      // Repetição: próxima ocorrência a partir da ocorrência agendada tratada.
      const next = nextComunicadoOccurrence(lastOccurrence, schedule, timezone)
      if (now.getTime() >= next.getTime()) {
        due.push(toDueComunicado(comunicado, deliveredCount, delivery?.failed_attempts ?? 0, confirmationSettings.mode, comunicado.confirmation_answers, comunicado.confirmation_wrong_points))
      }
    } else {
      // 1ª exibição (ou entrega zerada): "slot de hoje ou próximo" (regra do
      // usuário).
      const first = firstComunicadoOccurrence(now, schedule, timezone)
      if (now.getTime() >= first.getTime()) {
        due.push(toDueComunicado(comunicado, deliveredCount, delivery?.failed_attempts ?? 0, confirmationSettings.mode, comunicado.confirmation_answers, comunicado.confirmation_wrong_points))
      }
    }
  }

  return due
}

/**
 * DEPENDENTE confirma a exibição de um comunicado da própria casa. A frequência
 * é POR dependente: com limite, a contagem sobe até `repeats_total` (o servidor
 * nunca deixa ultrapassar, mesmo com a fila desatualizada); com `repeats_total
 * = 0` a contagem é livre e nunca encerra. A próxima repetição é ancorada na
 * **ocorrência agendada** (`last_occurrence_at`), não no `last_confirmed_at`:
 * confirmar atrasado não desloca a agenda e ocorrências perdidas são puladas.
 *
 * `typedPhrase` é a **confirmação de leitura** (regra do usuário): o dependente
 * precisa digitar ao menos `ALERT_TYPED_WORDS_REQUIRED` palavras do próprio
 * comunicado (título ou descrição, sem diferenciar caixa/acento). Valida aqui,
 * fail-closed — a UI só habilita o botão, mas um cliente adulterado não passa.
 */
export async function confirmComunicadoDelivery(
  comunicadoId: string,
  typedPhrase: string,
  selectedAnswerIndex?: number | null
): Promise<ActionResult> {
  const { user, profile } = await getSessionProfile()
  if (!user || profile?.user_role !== 'DEPENDENT') {
    return { ok: false, error: 'Apenas dependentes podem confirmar comunicados.' }
  }

  const house = await getDependentHouse(user.id)
  if (!house) return { ok: false, error: 'Você ainda não está vinculado a uma casa.' }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return { ok: false, error: 'Configuração do servidor indisponível.' }
  }

  const { data: comunicado } = await admin
    .from('comunicados')
    .select(
      'id, house_id, published, repeats_total, repeat_interval_days, repeat_weekdays, repeat_time, title, description, confirmation_answers, confirmation_correct_index, confirmation_wrong_points'
    )
    .eq('id', comunicadoId)
    .maybeSingle()

  if (!comunicado || comunicado.house_id !== house.id || !comunicado.published) {
    return { ok: false, error: 'Comunicado não está mais disponível.' }
  }

  const { data: row } = await admin
    .from('comunicado_deliveries')
    .select(
      'id, delivered_count, failed_attempts, last_confirmed_at, last_occurrence_at'
    )
    .eq('comunicado_id', comunicadoId)
    .eq('profile_id', user.id)
    .maybeSingle()

  const confirmationSettings = await getHouseComunicadoConfirmationSettings(house.id)
  const mode = confirmationSettings.mode

  const failedAttempts = row?.failed_attempts ?? 0
  const filteredCount = new Set(
    alertTargetWords(`${comunicado.title} ${comunicado.description}`)
  ).size
  const targetCount = Math.min(3 + Math.floor(failedAttempts / 2), filteredCount)

  // Confirmação por respostas: valida a opção marcada pelo dependente.
  if (mode === 'answers') {
    const answers = comunicado.confirmation_answers ?? []
    const correctIndex = comunicado.confirmation_correct_index
    const wrongPoints = comunicado.confirmation_wrong_points ?? 0
    if (answers.length < 2 || correctIndex === null || correctIndex === undefined) {
      return { ok: false, error: 'Este comunicado não tem respostas configuradas.' }
    }
    if (selectedAnswerIndex === null || selectedAnswerIndex === undefined) {
      return { ok: false, error: 'Selecione uma resposta para confirmar.' }
    }
    if (selectedAnswerIndex !== correctIndex) {
      // Subtrai pontos (pode ficar negativo) e registra tentativa falha.
      const { data: profile } = await admin
        .from('profiles')
        .select('points')
        .eq('id', user.id)
        .maybeSingle()
      const currentPoints = profile?.points ?? 0
      await admin
        .from('profiles')
        .update({ points: currentPoints - wrongPoints })
        .eq('id', user.id)
      const now = new Date().toISOString()
      if (!row) {
        await admin.from('comunicado_deliveries').insert({
          comunicado_id: comunicadoId,
          profile_id: user.id,
          house_id: house.id,
          delivered_count: 0,
          failed_attempts: 1,
          last_confirmed_at: null,
          last_occurrence_at: null,
          created_at: now,
          updated_at: now,
        })
      } else {
        await admin
          .from('comunicado_deliveries')
          .update({ failed_attempts: failedAttempts + 1, updated_at: now })
          .eq('id', row.id)
      }
      return {
        ok: false,
        error: `Resposta incorreta. Foram subtraídos ${wrongPoints} ponto(s).`,
      }
    }
    // resposta correta: segue o fluxo normal de confirmação abaixo.
  } else if (
    mode === 'words' &&
    !hasComunicadoConfirmation(mode, typedPhrase, comunicado.title, comunicado.description, undefined, targetCount)
  ) {
    const now = new Date().toISOString()
    if (!row) {
      const { error: insertError } = await admin.from('comunicado_deliveries').insert({
        comunicado_id: comunicadoId,
        profile_id: user.id,
        house_id: house.id,
        delivered_count: 0,
        failed_attempts: 1,
        last_confirmed_at: null,
        last_occurrence_at: null,
        created_at: now,
        updated_at: now,
      })
      if (insertError) {
        return { ok: false, error: `Falha ao registrar a tentativa: ${insertError.message}` }
      }
    } else {
      await admin
        .from('comunicado_deliveries')
        .update({ failed_attempts: failedAttempts + 1, updated_at: now })
        .eq('id', row.id)
    }
    return {
      ok: false,
      error: `Digite as ${targetCount} palavras indicadas para confirmar a leitura.`,
    }
  }

  const nowDate = new Date()
  const now = nowDate.toISOString()

  // Sem limite (`repeats_total = 0`): nunca é "concluído".
  if (
    row &&
    !isComunicadoUnlimited(comunicado.repeats_total) &&
    row.delivered_count >= comunicado.repeats_total
  ) {
    return { ok: false, error: 'Este comunicado já foi concluído.' }
  }

  const schedule = comunicadoSchedule(comunicado)
  const { timezone } = await getHouseTimezoneSettings(comunicado.house_id)
  // A repetição conta a partir da ocorrência agendada já tratada — o
  // `last_confirmed_at` é só auditoria do horário real da digitação. Linhas
  // anteriores à migração caem no fallback `last_confirmed_at`.
  const previousOccurrence = row?.last_occurrence_at
    ? new Date(row.last_occurrence_at)
    : row?.last_confirmed_at
      ? new Date(row.last_confirmed_at)
      : null
  let dueOccurrence: Date
  if (previousOccurrence) {
    dueOccurrence = nextComunicadoOccurrence(previousOccurrence, schedule, timezone)
    // Cliente pode estar com uma fila desatualizada (ex.: ADMIN mudou a
    // agenda): confirmar algo que ainda não venceu não consome repetição nem
    // mexe na âncora. A 1ª exibição não tem âncora para comparar (o overlay pode
    // estar aberto desde um slot antigo), então ela usa o slot mais recente.
    if (dueOccurrence.getTime() > nowDate.getTime()) {
      return { ok: false, error: 'Este comunicado ainda não está disponível.' }
    }
  } else {
    dueOccurrence = currentComunicadoOccurrence(nowDate, schedule, timezone)
  }
  // Confirmação atrasada: avança até a ocorrência mais recente que já passou,
  // para a próxima cair no futuro (sem fila de avisos perdidos).
  const lastOccurrenceAt = skipMissedComunicadoOccurrences(
    dueOccurrence,
    schedule,
    timezone,
    nowDate
  ).toISOString()

  if (!row) {
    const { error } = await admin.from('comunicado_deliveries').insert({
      comunicado_id: comunicadoId,
      profile_id: user.id,
      house_id: house.id,
      delivered_count: 1,
      failed_attempts: 0,
      last_confirmed_at: now,
      last_occurrence_at: lastOccurrenceAt,
      created_at: now,
      updated_at: now,
    })
    if (error) return { ok: false, error: `Falha ao confirmar o comunicado: ${error.message}` }
    return { ok: true, message: 'Comunicado confirmado.' }
  }

  // Update com guard no valor lido (+ 1 retry relendo): duas janelas não
  // perdem confirmação nem passam do `repeats_total` (quando há limite).
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: fresh } = await admin
      .from('comunicado_deliveries')
      .select('id, delivered_count')
      .eq('id', row.id)
      .maybeSingle()

    if (!fresh) break

    const count = isComunicadoUnlimited(comunicado.repeats_total)
      ? fresh.delivered_count + 1
      : Math.min(fresh.delivered_count + 1, comunicado.repeats_total)
    const { data: updated } = await admin
      .from('comunicado_deliveries')
      .update({
        delivered_count: count,
        failed_attempts: 0,
        last_confirmed_at: now,
        last_occurrence_at: lastOccurrenceAt,
        updated_at: now,
      })
      .eq('id', fresh.id)
      .eq('delivered_count', fresh.delivered_count)
      .select('id')

    if (updated && updated.length > 0) {
      return { ok: true, message: 'Comunicado confirmado.' }
    }
  }

  return { ok: false, error: 'Falha ao confirmar o comunicado. Tente novamente.' }
}
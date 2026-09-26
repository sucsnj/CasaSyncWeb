'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/utils/supabase/admin'
import {
  getActiveAdminHouse,
  getDependentHouse,
  getSessionProfile,
} from '@/utils/house'
import {
  COMUNICADO_MAX_INTERVAL_DAYS,
  COMUNICADO_MAX_REPEATS,
  COMUNICADO_TIME_PATTERN,
  comunicadoSchedule,
  nextComunicadoOccurrence,
  toDueComunicado,
  type Comunicado,
  type DueComunicado,
} from '@/utils/comunicados'
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
}): string | null {
  if (!input.title.trim()) return 'Informe o título do comunicado.'
  if (input.title.trim().length > 120) {
    return 'Título muito longo (máximo 120 caracteres).'
  }
  if (!input.description.trim()) return 'Informe a descrição do comunicado.'
  if (input.description.trim().length > 500) {
    return 'Descrição muito longa (máximo 500 caracteres).'
  }
  if (
    !Number.isInteger(input.repeatsTotal) ||
    input.repeatsTotal < 1 ||
    input.repeatsTotal > COMUNICADO_MAX_REPEATS
  ) {
    return `Quantas vezes cada dependente deve receber varia de 1 a ${COMUNICADO_MAX_REPEATS}.`
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
  return null
}

export type ComunicadoInput = {
  title: string
  description: string
  repeatsTotal: number
  repeatIntervalDays: number
  repeatWeekdays: number[]
  repeatTime: string
}

/**
 * ADMIN cria um comunicado (rascunho, `published = false`). Publicar é um passo
 * à parte (`setComunicadoPublished`); na publicação todos os dependentes da
 * casa ativa passam a recebê-lo em tempo real (quem está fechado, na próxima
 * abertura).
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
}

/**
 * ADMIN edita um comunicado da casa ativa. A edição da agenda vale para as
 * próximas ocorrências; as confirmações já feitas são preservadas.
 */
export async function updateComunicado(
  comunicadoId: string,
  patch: ComunicadoPatch
): Promise<ActionResult> {
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
  })
  if (validation) return { ok: false, error: validation }

  const { error } = await admin
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
      updated_at: new Date().toISOString(),
    })
    .eq('id', comunicadoId)
  if (error) return { ok: false, error: 'Falha ao salvar o comunicado.' }

  revalidatePath('/dashboard/admin/comunicados')
  return { ok: true, message: 'Comunicado atualizado.' }
}

/**
 * ADMIN publica/despublica um comunicado da casa ativa. Publicar dispara o
 * Realtime para os dependentes (a fila deles reavalia os "devidos" na hora);
 * despublicar os faz parar de receber nas próximas avaliações.
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
    .select('house_id, title, published')
    .eq('id', comunicadoId)
    .maybeSingle()

  if (!comunicado || comunicado.house_id !== activeHouse.id) {
    return { ok: false, error: 'Comunicado não encontrado nesta casa.' }
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
      ? `Comunicado "${comunicado.title}" publicado — os dependentes recebem agora.`
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
 * Comunicados "devidos" do DEPENDENTE da própria casa (papel e casa derivados
 * da sessão — nunca de input público):
 *
 * - sem linha de entrega → devido (primeira exibição, imediata desde a
 *   publicação; cobre quem estava com o app fechado);
 * - `delivered_count >= repeats_total` → encerrado para este dependente;
 * - senão, devido quando `now >= próxima ocorrência` da agenda
 *   (`repeat_interval_days`/`repeat_weekdays`/`repeat_time`).
 *
 * Usado pelo servidor (lista inicial das telas do dependente) e pela fila
 * client-side (refresh a cada evento Realtime).
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
    .select('comunicado_id, delivered_count, last_confirmed_at')
    .eq('profile_id', user.id)
    .in('comunicado_id', ids)

  const deliveriesByComunicado = new Map(
    (deliveries ?? []).map((delivery) => [delivery.comunicado_id, delivery])
  )

  const now = new Date()
  const due: DueComunicado[] = []

  for (const comunicado of comunicados) {
    const delivery = deliveriesByComunicado.get(comunicado.id)
    const deliveredCount = delivery?.delivered_count ?? 0

    if (!delivery) {
      due.push(toDueComunicado(comunicado, 0))
      continue
    }

    if (deliveredCount >= comunicado.repeats_total) continue

    const lastConfirmed = delivery.last_confirmed_at
      ? new Date(delivery.last_confirmed_at)
      : new Date(comunicado.created_at)
    const next = nextComunicadoOccurrence(lastConfirmed, comunicadoSchedule(comunicado))
    if (now.getTime() >= next.getTime()) {
      due.push(toDueComunicado(comunicado, deliveredCount))
    }
  }

  return due
}

/**
 * DEPENDENTE confirma a exibição de um comunicado da própria casa. A frequência
 * é POR dependente: a contagem sobe até `repeats_total` (o servidor nunca deixa
 * ultrapassar, mesmo com a fila desatualizada) e cada confirmação vira o
 * `last_confirmed_at` que agenda a próxima repetição.
 */
export async function confirmComunicadoDelivery(
  comunicadoId: string
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
    .select('id, house_id, published, repeats_total')
    .eq('id', comunicadoId)
    .maybeSingle()

  if (!comunicado || comunicado.house_id !== house.id || !comunicado.published) {
    return { ok: false, error: 'Comunicado não está mais disponível.' }
  }

  const now = new Date().toISOString()

  const { data: row } = await admin
    .from('comunicado_deliveries')
    .select('id, delivered_count')
    .eq('comunicado_id', comunicadoId)
    .eq('profile_id', user.id)
    .maybeSingle()

  if (!row) {
    const { error } = await admin.from('comunicado_deliveries').insert({
      comunicado_id: comunicadoId,
      profile_id: user.id,
      house_id: house.id,
      delivered_count: 1,
      last_confirmed_at: now,
      created_at: now,
      updated_at: now,
    })
    if (error) return { ok: false, error: 'Falha ao confirmar o comunicado.' }
    return { ok: true, message: 'Comunicado confirmado.' }
  }

  if (row.delivered_count >= comunicado.repeats_total) {
    return { ok: false, error: 'Este comunicado já foi concluído.' }
  }

  // Update com guard no valor lido (+ 1 retry relendo): duas janelas não
  // perdem confirmação nem passam do `repeats_total`.
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: fresh } = await admin
      .from('comunicado_deliveries')
      .select('id, delivered_count')
      .eq('id', row.id)
      .maybeSingle()

    if (!fresh) break

    const count = Math.min(fresh.delivered_count + 1, comunicado.repeats_total)
    const { data: updated } = await admin
      .from('comunicado_deliveries')
      .update({ delivered_count: count, last_confirmed_at: now, updated_at: now })
      .eq('id', fresh.id)
      .eq('delivered_count', fresh.delivered_count)
      .select('id')

    if (updated && updated.length > 0) {
      return { ok: true, message: 'Comunicado confirmado.' }
    }
  }

  return { ok: false, error: 'Falha ao confirmar o comunicado. Tente novamente.' }
}
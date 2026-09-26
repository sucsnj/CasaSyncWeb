'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/utils/supabase/admin'
import {
  getActiveAdminHouse,
  getDependentHouse,
  getSessionProfile,
} from '@/utils/house'
import {
  notifyHouse,
  notifyUser,
  toPushPayload,
  type NotifyInput,
  type NotifyHouseInput,
} from '@/utils/notifications'
import { getHouseRewardPricingSettings } from '@/utils/house-settings'
import type { RewardPricingSettings } from '@/utils/settings'
import { sendPushToHouseAdmins, sendPushToUser } from './push'
import { registerAchievementProgress } from './achievements'
import type { ActionResult } from './types'

type CreateRewardInput = {
  title: string
  description: string | null
  pointsCost: number
  emoji: string | null
  imageUrl: string | null
}

export type RewardPatch = {
  title?: string
  description?: string | null
  points_cost?: number
  emoji?: string | null
  image_url?: string | null
}

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

export async function createReward(input: CreateRewardInput): Promise<ActionResult> {
  const activeHouse = await getActiveAdminHouse()
  if (!activeHouse) return { ok: false, error: 'Selecione uma casa primeiro.' }

  const admin = createAdminClient()
  const auth = await assertAdminCanManage(admin, activeHouse.id)
  if (!auth.ok) return auth

  const title = input.title.trim()
  if (!title) return { ok: false, error: 'Informe o título da recompensa.' }
  if (input.pointsCost <= 0) {
    return { ok: false, error: 'O custo deve ser maior que zero.' }
  }

  const { error } = await admin.from('rewards').insert({
    house_id: activeHouse.id,
    title,
    description: input.description?.trim() ? input.description.trim() : null,
    points_cost: input.pointsCost,
    emoji: input.emoji?.trim() ? input.emoji.trim().slice(0, 8) : null,
    image_url: input.imageUrl?.trim() ? input.imageUrl.trim() : null,
    created_by: auth.adminId,
  })

  if (error) return { ok: false, error: 'Falha ao criar a recompensa.' }

  await notifyHouse(admin, {
    houseId: activeHouse.id,
    actorId: auth.adminId,
    side: 'DEPENDENTS',
    type: 'REWARD_CREATED',
    title: 'Nova recompensa',
    body: `"${title}" entrou na loja por ${input.pointsCost} pts.`,
    link: '/rewards',
  })

  revalidatePath('/rewards')
  return { ok: true, message: `Recompensa "${title}" criada.` }
}

/**
 * DEPENDENTE solicita o resgate. A validação de saldo acontece aqui (no
 * momento do pedido) e é revalidada de novo na aprovação — dois checagens
 * porque o saldo pode mudar entre o pedido e a aprovação.
 */
export async function requestRedemption(rewardId: string): Promise<ActionResult> {
  const { user, profile } = await getSessionProfile()
  if (!user || profile?.user_role !== 'DEPENDENT') {
    return { ok: false, error: 'Apenas dependentes podem solicitar resgates.' }
  }

  const house = await getDependentHouse(user.id)
  if (!house) return { ok: false, error: 'Você ainda não está vinculado a uma casa.' }

  const admin = createAdminClient()

  const { data: reward } = await admin
    .from('rewards')
    .select('id, house_id, title, points_cost, active')
    .eq('id', rewardId)
    .maybeSingle()

  if (!reward || reward.house_id !== house.id) {
    return { ok: false, error: 'Recompensa não encontrada na sua casa.' }
  }
  if (reward.active === false) {
    return { ok: false, error: 'Recompensa indisponível no momento.' }
  }

  const { data: dependent } = await admin
    .from('profiles')
    .select('points')
    .eq('id', user.id)
    .maybeSingle()

  if (!dependent || dependent.points < reward.points_cost) {
    return { ok: false, error: 'Saldo de pontos insuficiente.' }
  }

  const { error } = await admin.from('reward_redemptions').insert({
    house_id: house.id,
    reward_id: reward.id,
    profile_id: user.id,
    points_cost: reward.points_cost,
    status: 'PENDING',
  })

  if (error) return { ok: false, error: 'Falha ao solicitar o resgate.' }

  const notifInput: NotifyHouseInput = {
    houseId: house.id,
    actorId: user.id,
    side: 'ADMINS',
    excludeUserId: user.id,
    type: 'REDEMPTION_REQUESTED',
    title: 'Novo resgate',
    body: `${profile?.full_name ?? 'O dependente'} resgatou "${reward.title}" (${reward.points_cost} pts).`,
    link: '/rewards',
  }

  await notifyHouse(admin, notifInput, { dispatchPush: false })

  try {
    await sendPushToHouseAdmins(house.id, toPushPayload(notifInput), user.id)
    console.log(`[PUSH] Resgate solicitado → push disparado para os ADMINs da casa ${house.id}`)
  } catch (err) {
    console.error('[PUSH] Falha ao disparar push na solicitação de resgate:', err)
  }

  revalidatePath('/rewards')
  return { ok: true, message: `Resgate de "${reward.title}" solicitado.` }
}

/**
 * Novo custo de uma recompensa após um resgate aprovado, conforme a
 * configuração da casa (ver `RewardPricingSettings`):
 * - custo <= `noIncreaseMax` → **não encarece**;
 * - custo <= `midMax` → `midRate`; acima → `highRate`;
 * - quando encarece, o aumento mínimo é de `minBump` pontos.
 * Chamada só quando `settings.enabled`; retorna `null` se não mudar.
 */
function nextRewardCost(
  currentCost: number,
  settings: RewardPricingSettings
): number | null {
  if (currentCost <= settings.noIncreaseMax) return null
  const rate = currentCost <= settings.midMax ? settings.midRate : settings.highRate
  const bumped = Math.round(currentCost * (1 + rate))
  return Math.max(bumped, currentCost + settings.minBump)
}

/**
 * ADMIN aprova o resgate e DEBITA os pontos do dependente.
 * A escrita condicional usa `.eq('status','PENDING')` + `.gte('points', cost)`
 * para que requisições concorrentes não gastem o mesmo saldo duas vezes.
 */
export async function approveRedemption(redemptionId: string): Promise<ActionResult> {
  const activeHouse = await getActiveAdminHouse()
  if (!activeHouse) return { ok: false, error: 'Selecione uma casa primeiro.' }

  const admin = createAdminClient()
  const auth = await assertAdminCanManage(admin, activeHouse.id)
  if (!auth.ok) return auth

  const { data: redemption } = await admin
    .from('reward_redemptions')
    .select('house_id, status, profile_id, points_cost, reward_id')
    .eq('id', redemptionId)
    .maybeSingle()

  if (!redemption || redemption.house_id !== activeHouse.id) {
    return { ok: false, error: 'Resgate não encontrado nesta casa.' }
  }
  if (redemption.status !== 'PENDING') {
    return { ok: false, error: 'Este resgate já foi resolvido.' }
  }

  const { data: dependent } = await admin
    .from('profiles')
    .select('points')
    .eq('id', redemption.profile_id)
    .maybeSingle()

  if (!dependent || dependent.points < redemption.points_cost) {
    return { ok: false, error: 'Saldo insuficiente. Rejeite ou reavalie o pedido.' }
  }

  const { data: resolved, error: redeemError } = await admin
    .from('reward_redemptions')
    .update({
      status: 'APPROVED',
      approved_by: auth.adminId,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', redemptionId)
    .eq('status', 'PENDING')
    .select('id')

  if (redeemError || !resolved || resolved.length === 0) {
    return { ok: false, error: 'Resgate já resolvido por outra solicitação.' }
  }

  const { data: debited, error: debitError } = await admin
    .from('profiles')
    .update({ points: dependent.points - redemption.points_cost })
    .eq('id', redemption.profile_id)
    .gte('points', redemption.points_cost)
    .select('id')

  if (debitError || !debited || debited.length === 0) {
    await admin
      .from('reward_redemptions')
      .update({ status: 'PENDING', approved_by: null, resolved_at: null })
      .eq('id', redemptionId)
    return { ok: false, error: 'Falha ao debitar pontos. Resgate revertido.' }
  }

  // Recompensa encarece a cada resgate aprovado SE o ADMIN da casa tiver o
  // aumento automático ligado (configuração por casa em `house_settings`). Lê o
  // custo atual da recompensa (não o snapshot do resgate). O `.eq('points_cost', ...)`
  // impede que duas aprovações concorrentes sobrescrevam o aumento uma da outra.
  const rewardSettings = await getHouseRewardPricingSettings(activeHouse.id)
  const { data: reward } = await admin
    .from('rewards')
    .select('id, points_cost')
    .eq('id', redemption.reward_id)
    .maybeSingle()

  let newCost: number | null = null
  if (reward && rewardSettings.enabled) {
    newCost = nextRewardCost(reward.points_cost, rewardSettings)
  }

  if (reward && newCost !== null && newCost !== reward.points_cost) {
    const { data: bumped, error: bumpError } = await admin
      .from('rewards')
      .update({ points_cost: newCost })
      .eq('id', redemption.reward_id)
      .eq('points_cost', reward.points_cost)
      .select('id')

    if (bumpError || !bumped || bumped.length === 0) {
      // Aprovação encalhou antes de encarecer a recompensa: devolve o débito e
      // reabre o resgate para reprocessar (mesmo padrão de rollback do débito).
      await admin
        .from('reward_redemptions')
        .update({ status: 'PENDING', approved_by: null, resolved_at: null })
        .eq('id', redemptionId)
      await admin
        .from('profiles')
        .update({ points: dependent.points })
        .eq('id', redemption.profile_id)
      return {
        ok: false,
        error: 'Falha ao aplicar o aumento de custo. Resgate revertido.',
      }
    }
  }

  const notifInput: NotifyInput & { recipientId: string } = {
    houseId: activeHouse.id,
    recipientId: redemption.profile_id,
    actorId: auth.adminId,
    type: 'REDEMPTION_APPROVED',
    title: 'Resgate aprovado',
    body: newCost
      ? `Seu resgate foi aprovado. −${redemption.points_cost} pts. A recompensa agora custa ${newCost} pts.`
      : `Seu resgate foi aprovado. −${redemption.points_cost} pts.`,
    link: '/rewards',
  }

  await notifyUser(admin, notifInput, { dispatchPush: false })

  try {
    await sendPushToUser(redemption.profile_id, toPushPayload(notifInput))
    console.log(`[PUSH] Resgate aprovado → push disparado para o dependente ${redemption.profile_id}`)
  } catch (err) {
    console.error('[PUSH] Falha ao disparar push na aprovação de resgate:', err)
  }

  // Conquistas: um resgate aprovado conta em REWARDS_CLAIMED (best-effort).
  await registerAchievementProgress(
    activeHouse.id,
    redemption.profile_id,
    'REWARDS_CLAIMED',
    1
  )

  revalidatePath('/rewards')
  revalidatePath('/dashboard/dependent')
  revalidatePath('/tasks')

  return { ok: true, message: 'Resgate aprovado e pontos debitados.' }
}

export async function rejectRedemption(redemptionId: string): Promise<ActionResult> {
  const activeHouse = await getActiveAdminHouse()
  if (!activeHouse) return { ok: false, error: 'Selecione uma casa primeiro.' }

  const admin = createAdminClient()
  const auth = await assertAdminCanManage(admin, activeHouse.id)
  if (!auth.ok) return auth

  const { data: redemption } = await admin
    .from('reward_redemptions')
    .select('house_id, status, profile_id')
    .eq('id', redemptionId)
    .maybeSingle()

  if (!redemption || redemption.house_id !== activeHouse.id) {
    return { ok: false, error: 'Resgate não encontrado nesta casa.' }
  }
  if (redemption.status !== 'PENDING') {
    return { ok: false, error: 'Este resgate já foi resolvido.' }
  }

  const { error } = await admin
    .from('reward_redemptions')
    .update({
      status: 'REJECTED',
      approved_by: auth.adminId,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', redemptionId)
    .eq('status', 'PENDING')

  if (error) return { ok: false, error: 'Falha ao rejeitar o resgate.' }

  const notifInput: NotifyInput & { recipientId: string } = {
    houseId: activeHouse.id,
    recipientId: redemption.profile_id,
    actorId: auth.adminId,
    type: 'REDEMPTION_REJECTED',
    title: 'Resgate recusado',
    body: 'Seu resgate foi recusado.',
    link: '/rewards',
  }

  await notifyUser(admin, notifInput, { dispatchPush: false })

  try {
    await sendPushToUser(redemption.profile_id, toPushPayload(notifInput))
    console.log(`[PUSH] Resgate recusado → push disparado para o dependente ${redemption.profile_id}`)
  } catch (err) {
    console.error('[PUSH] Falha ao disparar push na rejeição de resgate:', err)
  }

  revalidatePath('/rewards')
  return { ok: true, message: 'Resgate rejeitado.' }
}

/** ADMIN edita uma recompensa da casa ativa (sem excluir). */
export async function updateReward(
  rewardId: string,
  patch: RewardPatch
): Promise<ActionResult> {
  const activeHouse = await getActiveAdminHouse()
  if (!activeHouse) return { ok: false, error: 'Selecione uma casa primeiro.' }

  const admin = createAdminClient()
  const auth = await assertAdminCanManage(admin, activeHouse.id)
  if (!auth.ok) return auth

  const updates: RewardPatch = {}
  if ('title' in patch) {
    const title = patch.title?.trim()
    if (!title) return { ok: false, error: 'Informe o título da recompensa.' }
    updates.title = title
  }
  if ('description' in patch) {
    updates.description = patch.description?.trim() || null
  }
  if ('points_cost' in patch) {
    const cost = patch.points_cost
    if (cost === undefined || cost <= 0) {
      return { ok: false, error: 'O custo deve ser maior que zero.' }
    }
    updates.points_cost = cost
  }
  if ('emoji' in patch) {
    updates.emoji = patch.emoji?.trim().slice(0, 8) || null
  }
  if ('image_url' in patch) {
    updates.image_url = patch.image_url?.trim() || null
  }

  if (Object.keys(updates).length === 0) return { ok: true }

  const { data: reward } = await admin
    .from('rewards')
    .select('house_id')
    .eq('id', rewardId)
    .maybeSingle()

  if (!reward || reward.house_id !== activeHouse.id) {
    return { ok: false, error: 'Recompensa não encontrada nesta casa.' }
  }

  const { error } = await admin
    .from('rewards')
    .update(updates)
    .eq('id', rewardId)
    .eq('house_id', activeHouse.id)

  if (error) return { ok: false, error: 'Falha ao atualizar a recompensa.' }

  revalidatePath('/rewards')
  return { ok: true, message: 'Recompensa atualizada.' }
}

/**
 * ADMIN desativa/reativa uma recompensa da casa ativa. A recompensa nunca é
 * excluída — apenas fica "indisponível" para os dependentes até ser reativada.
 */
export async function setRewardActive(
  rewardId: string,
  active: boolean
): Promise<ActionResult> {
  const activeHouse = await getActiveAdminHouse()
  if (!activeHouse) return { ok: false, error: 'Selecione uma casa primeiro.' }

  const admin = createAdminClient()
  const auth = await assertAdminCanManage(admin, activeHouse.id)
  if (!auth.ok) return auth

  const { data: reward } = await admin
    .from('rewards')
    .select('id, house_id, title')
    .eq('id', rewardId)
    .maybeSingle()

  if (!reward || reward.house_id !== activeHouse.id) {
    return { ok: false, error: 'Recompensa não encontrada nesta casa.' }
  }

  const { error } = await admin
    .from('rewards')
    .update({ active })
    .eq('id', rewardId)
    .eq('house_id', activeHouse.id)

  if (error) return { ok: false, error: 'Falha ao atualizar a recompensa.' }

  revalidatePath('/rewards')
  return {
    ok: true,
    message: active
      ? `Recompensa "${reward.title}" reativada.`
      : `Recompensa "${reward.title}" desativada.`,
  }
}

type CreateSuggestionInput = {
  title: string
  description: string | null
  pointsCost: number | null
  imageUrl: string | null
}

/** DEPENDENTE sugere uma recompensa — o ADMIN aprova/cria ou rejeita. */
export async function createRewardSuggestion(
  input: CreateSuggestionInput
): Promise<ActionResult> {
  const { user, profile } = await getSessionProfile()
  if (!user || profile?.user_role !== 'DEPENDENT') {
    return { ok: false, error: 'Apenas dependentes podem sugerir recompensas.' }
  }

  const house = await getDependentHouse(user.id)
  if (!house) return { ok: false, error: 'Você ainda não está vinculado a uma casa.' }

  const title = input.title.trim()
  if (!title) return { ok: false, error: 'Informe o nome da recompensa.' }
  if (input.pointsCost !== null && input.pointsCost <= 0) {
    return { ok: false, error: 'O custo deve ser maior que zero.' }
  }

  const admin = createAdminClient()
  const { error } = await admin.from('reward_suggestions').insert({
    house_id: house.id,
    profile_id: user.id,
    title,
    description: input.description?.trim() ? input.description.trim() : null,
    points_cost: input.pointsCost,
    image_url: input.imageUrl?.trim() ? input.imageUrl.trim() : null,
    status: 'PENDING',
  })

  if (error) return { ok: false, error: 'Falha ao enviar a sugestão.' }

  await notifyHouse(admin, {
    houseId: house.id,
    actorId: user.id,
    side: 'ADMINS',
    excludeUserId: user.id,
    type: 'SUGGESTION_CREATED',
    title: 'Nova sugestão',
    body: `${profile?.full_name ?? 'O dependente'} sugeriu a recompensa "${title}".`,
    link: '/rewards',
  })

  revalidatePath('/rewards')
  return { ok: true, message: 'Sugestão enviada para aprovação.' }
}

/**
 * ADMIN aprova (cria a recompensa real e marca a sugestão como APPROVED) ou
 * rejeita. Escrita condicional `.eq('status','PENDING')` + rollback impedem
 * que uma sugestão vire duas recompensas em requisições concorrentes.
 */
export async function resolveRewardSuggestion(
  suggestionId: string,
  approve: boolean
): Promise<ActionResult> {
  const activeHouse = await getActiveAdminHouse()
  if (!activeHouse) return { ok: false, error: 'Selecione uma casa primeiro.' }

  const admin = createAdminClient()
  const auth = await assertAdminCanManage(admin, activeHouse.id)
  if (!auth.ok) return auth

  const { data: suggestion } = await admin
    .from('reward_suggestions')
    .select('id, house_id, profile_id, title, description, points_cost, image_url, status')
    .eq('id', suggestionId)
    .maybeSingle()

  if (!suggestion || suggestion.house_id !== activeHouse.id) {
    return { ok: false, error: 'Sugestão não encontrada nesta casa.' }
  }
  if (suggestion.status !== 'PENDING') {
    return { ok: false, error: 'Esta sugestão já foi resolvida.' }
  }

  const { data: resolved, error: statusError } = await admin
    .from('reward_suggestions')
    .update({ status: approve ? 'APPROVED' : 'REJECTED' })
    .eq('id', suggestionId)
    .eq('status', 'PENDING')
    .select('id')

  if (statusError || !resolved || resolved.length === 0) {
    return { ok: false, error: 'Sugestão já resolvida por outra solicitação.' }
  }

  if (approve) {
    const { error: rewardError } = await admin.from('rewards').insert({
      house_id: activeHouse.id,
      title: suggestion.title,
      description: suggestion.description,
      points_cost: suggestion.points_cost ?? 5,
      image_url: suggestion.image_url,
      created_by: auth.adminId,
    })

    if (rewardError) {
      await admin
        .from('reward_suggestions')
        .update({ status: 'PENDING' })
        .eq('id', suggestionId)
      return { ok: false, error: 'Falha ao criar a recompensa. Sugestão revertida.' }
    }
  }

  await notifyUser(admin, {
    houseId: activeHouse.id,
    recipientId: suggestion.profile_id,
    actorId: auth.adminId,
    type: approve ? 'SUGGESTION_APPROVED' : 'SUGGESTION_REJECTED',
    title: approve ? 'Sugestão aprovada' : 'Sugestão rejeitada',
    body: `Sua sugestão "${suggestion.title}" foi ${approve ? 'aprovada' : 'rejeitada'}.`,
    link: '/rewards',
  })

  // Conquistas: uma sugestão aprovada pelo ADMIN conta em
  // CUSTOM_REWARDS_APPROVED para o dependente autor (best-effort).
  if (approve) {
    await registerAchievementProgress(
      activeHouse.id,
      suggestion.profile_id,
      'CUSTOM_REWARDS_APPROVED',
      1
    )
  }

  revalidatePath('/rewards')
  return { ok: true, message: approve ? 'Sugestão aprovada e recompensa criada.' : 'Sugestão rejeitada.' }
}
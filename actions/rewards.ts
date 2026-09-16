'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/utils/supabase/admin'
import {
  getActiveAdminHouse,
  getDependentHouse,
  getSessionProfile,
} from '@/utils/house'
import type { ActionResult } from './types'

type CreateRewardInput = {
  title: string
  description: string | null
  pointsCost: number
}

async function assertAdminCanManage(
  admin: ReturnType<typeof createAdminClient>,
  houseId: string
): Promise<{ ok: true; adminId: string } | { ok: false; error: string }> {
  const { user, profile } = await getSessionProfile()

  if (!user || profile?.user_role !== 'ADMIN') {
    return { ok: false, error: 'Apenas administradores podem executar esta ação.' }
  }

  const { data: house } = await admin
    .from('houses')
    .select('owner_id')
    .eq('id', houseId)
    .maybeSingle()

  if (!house || house.owner_id !== user.id) {
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
    created_by: auth.adminId,
  })

  if (error) return { ok: false, error: 'Falha ao criar a recompensa.' }

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
    .select('id, house_id, title, points_cost')
    .eq('id', rewardId)
    .maybeSingle()

  if (!reward || reward.house_id !== house.id) {
    return { ok: false, error: 'Recompensa não encontrada na sua casa.' }
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

  revalidatePath('/rewards')
  return { ok: true, message: `Resgate de "${reward.title}" solicitado.` }
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
    .select('house_id, status')
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

  revalidatePath('/rewards')
  return { ok: true, message: 'Resgate rejeitado.' }
}
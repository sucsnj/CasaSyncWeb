'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/utils/supabase/admin'
import { getActiveAdminHouse, getSessionProfile } from '@/utils/house'
import {
  punishmentExpiryFromNow,
  punishmentLevelLabel,
  normalizePunishmentLevel,
  validatePunishmentFields,
  type ActivePunishment,
  type PunishmentInput,
} from '@/utils/punishments'
import type { ActionResult } from './types'

/**
 * CASTIGO DO DEPENDENTE (ADR-0020) — o ADMIN escreve um aviso que o dependente
 * vê como ícone de triângulo no cabeçalho. É **só um indicador**: não mexe em
 * pontos, tarefas, recompensas, conquistas nem saldo.
 *
 * Sem Realtime por decisão de produto (mesma premissa dos comunicados,
 * ADR-0017): o dependente passa a ver o castigo ao **atualizar a tela ou
 * navegar**. Por isso as `revalidatePath` abaixo cobrem as telas do dependente —
 * elas invalidam o cache de navegação para que a próxima renderização já traga o
 * castigo novo, sem depender de nenhum evento ao vivo.
 *
 * A casa NUNCA vem por parâmetro público: é a casa ativa da sessão
 * (`getActiveAdminHouse`), como nas demais actions de gestão.
 */

/** ADMIN da casa ativa + alvo `DEPENDENT` da mesma casa (fail closed). */
async function assertCanPunish(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string
): Promise<
  | { ok: true; houseId: string; adminId: string }
  | { ok: false; error: string }
> {
  const { user, profile } = await getSessionProfile()

  if (!user || profile?.user_role !== 'ADMIN') {
    return { ok: false, error: 'Apenas administradores podem aplicar castigo.' }
  }

  const activeHouse = await getActiveAdminHouse()
  if (!activeHouse) {
    return { ok: false, error: 'Crie ou selecione uma casa primeiro.' }
  }

  // O ator precisa controlar a casa ativa (co-gestão por PIN também vale).
  const { data: membership } = await admin
    .from('house_members')
    .select('id')
    .eq('house_id', activeHouse.id)
    .eq('profile_id', user.id)
    .eq('role', 'ADMIN')
    .maybeSingle()

  if (!membership) {
    return { ok: false, error: 'Casa não encontrada ou sem permissão.' }
  }

  // O alvo precisa ser dependente da casa ativa — nunca confiar no id do client
  // sozinho, nem punir um ADMIN.
  const { data: target } = await admin
    .from('house_members')
    .select('id, role')
    .eq('house_id', activeHouse.id)
    .eq('profile_id', profileId)
    .maybeSingle()

  if (!target) {
    return { ok: false, error: 'Dependente não encontrado nesta casa.' }
  }

  if (target.role !== 'DEPENDENT') {
    return { ok: false, error: 'Castigo só se aplica a dependentes.' }
  }

  return { ok: true, houseId: activeHouse.id, adminId: user.id }
}

/** Mapeia a linha gravada para o formato serializável que atravessa ao client. */
function toActivePunishment(row: {
  id: string
  level: number | null
  description: string | null
  duration_days: number | null
  expires_at: string | null
  created_at: string
}): ActivePunishment {
  return {
    id: row.id,
    level: normalizePunishmentLevel(row.level),
    description: row.description?.trim() || null,
    durationDays: row.duration_days ?? null,
    expiresAt: row.expires_at ?? null,
    createdAt: row.created_at,
  }
}

/**
 * Aplica (ou SUBSTITUI) o aviso/castigo de um dependente da casa ativa.
 *
 * **Dois níveis, escolhidos pelo ADMIN:** `1` = aviso (o dependente vê o
 * triângulo amarelo, avisando que o castigo está próximo) e `2` = castigo
 * (triângulo vermelho). Os dois continuam sendo **só indicador** — nenhum ponto,
 * tarefa, recompensa ou conquista é tocada (ADR-0020). Nível ausente cai no 2,
 * que é o comportamento anterior.
 *
 * Descrição e duração são opcionais: sem descrição o aviso aparece só com o
 * ícone; sem duração ele não expira (sai quando o ADMIN remove). Como a tabela
 * tem `unique (profile_id)`, aplicar de novo **substitui** o anterior — trocar
 * de nível é só salvar de novo.
 */
export async function applyPunishment(
  profileId: string,
  input: PunishmentInput
): Promise<ActionResult<{ punishment: ActivePunishment }>> {
  if (!profileId) {
    return { ok: false, error: 'Dependente não informado.' }
  }

  const validation = validatePunishmentFields(input)
  if (validation) return { ok: false, error: validation }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return { ok: false, error: 'Configuração do servidor indisponível.' }
  }

  const auth = await assertCanPunish(admin, profileId)
  if (!auth.ok) return auth

  const now = new Date()
  const description = input.description?.trim() || null
  const durationDays =
    input.durationDays === undefined || input.durationDays === null
      ? null
      : input.durationDays
  const expiresAt = punishmentExpiryFromNow(durationDays, now)
  const level = normalizePunishmentLevel(input.level ?? null)
  const label = punishmentLevelLabel(level)

  // `unique (profile_id)` transforma o "aplicar de novo" em substituição.
  const { data, error } = await admin
    .from('dependent_punishments')
    .upsert(
      {
        house_id: auth.houseId,
        profile_id: profileId,
        level,
        description,
        duration_days: durationDays,
        expires_at: expiresAt,
        created_by: auth.adminId,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      },
      { onConflict: 'profile_id' }
    )
    .select('id, level, description, duration_days, expires_at, created_at')
    .single()

  if (error || !data) {
    return { ok: false, error: `Falha ao aplicar o ${label.toLowerCase()}.` }
  }

  // Telas do dependente: a próxima renderização já mostra (ou some com) o ícone.
  revalidatePath('/dashboard/dependent')
  revalidatePath('/tasks')
  revalidatePath('/rewards')
  revalidatePath('/achievements')
  revalidatePath('/dashboard/admin/houses')

  return {
    ok: true,
    data: { punishment: toActivePunishment(data) },
    message: `${label} aplicado. O dependente verá um triângulo ${
      level === 1 ? 'amarelo' : 'vermelho'
    } no cabeçalho.`,
  }
}

/**
 * Remove o castigo do dependente da casa ativa (limpeza manual). Idempotente:
 * não haver castigo não é erro.
 */
export async function removePunishment(
  profileId: string
): Promise<ActionResult> {
  if (!profileId) {
    return { ok: false, error: 'Dependente não informado.' }
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return { ok: false, error: 'Configuração do servidor indisponível.' }
  }

  const auth = await assertCanPunish(admin, profileId)
  if (!auth.ok) return auth

  const { error } = await admin
    .from('dependent_punishments')
    .delete()
    .eq('house_id', auth.houseId)
    .eq('profile_id', profileId)

  if (error) {
    return { ok: false, error: 'Falha ao remover o castigo.' }
  }

  revalidatePath('/dashboard/dependent')
  revalidatePath('/tasks')
  revalidatePath('/rewards')
  revalidatePath('/achievements')
  revalidatePath('/dashboard/admin/houses')

  return { ok: true, message: 'Castigo removido.' }
}
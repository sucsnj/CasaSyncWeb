'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/utils/supabase/admin'
import { getSessionProfile } from '@/utils/house'
import {
  attachmentTypeFromName,
  CHEST_ITEM_FOLDER,
  validateChestItemAttachment,
  validateChestItemTitle,
} from '@/utils/chest-attachment'
import { removeStorageFile } from '@/utils/storage'
import { getHouseAttachmentSettings, getHouseChestRulesSettings } from '@/utils/house-settings'
import type { ActionResult } from './types'
import type { Tables } from '@/types/database'

/**
 * BAÚ DA CASA (ADR-0024) — acervo de arquivos que o ADMIN disponibiliza para os
 * dependentes: imagem, vídeo, PDF ou página HTML, **só com título**. Sem pontos,
 * sem resgate, sem notificação — é consulta, não evento.
 *
 * **Escopo sempre derivado da sessão.** O `houseId` que o cliente manda no
 * `createChestItem` NÃO é o escopo: ele é conferido contra `house_members` com
 * `role = 'ADMIN'` antes de gravar. E o `itemId` das outras duas actions é lido
 * do banco **com a casa junto** — a autorização é a casa do próprio item, não a
 * casa ativa, porque o ADMIN gerencia o baú de todas as casas que controla (o
 * item criado na casa B aparece na lista com chip, sem trocar de casa).
 *
 * Escrita por service-role (ADR-0001): a tabela não tem policy de escrita, então
 * o browser não tem caminho próprio — só estas actions.
 */

/** ADMIN da casa indicada (mesmo guard das demais actions de gestão). */
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

/** Extensão do caminho da URL, sem exceção: o storage sempre manda path válido. */
function attachmentTypeFromUrl(url: string): string {
  try {
    return attachmentTypeFromName(new URL(url).pathname)
  } catch {
    return ''
  }
}

/** Carrega o item já com a casa, para autorizar pela casa **dele**. */
async function loadManagedItem(
  admin: ReturnType<typeof createAdminClient>,
  itemId: string
): Promise<
  | { ok: true; item: Tables<'chest_items'> }
  | { ok: false; error: string }
> {
  const { user, profile } = await getSessionProfile()

  if (!user || profile?.user_role !== 'ADMIN') {
    return { ok: false, error: 'Apenas administradores podem executar esta ação.' }
  }

  const { data: item } = await admin
    .from('chest_items')
    .select('*')
    .eq('id', itemId)
    .maybeSingle()

  // Item inexistente ou de outra casa que ele não controla: mesma resposta para
  // os dois casos — não revela a existência do item.
  if (!item) return { ok: false, error: 'Item do baú não encontrado.' }

  const auth = await assertAdminCanManage(admin, item.house_id)
  if (!auth.ok) return { ok: false, error: 'Item do baú não encontrado.' }

  return { ok: true, item }
}

/** Rebaixa a tela do dependente e a do baú depois de qualquer escrita. */
function revalidateChest() {
  revalidatePath('/chest')
  revalidatePath('/dashboard/dependent')
}

/**
 * Teto de itens do baú (chave `chest_rules`, ADR-0024).
 *
 * Existe por **disponibilidade**: o bucket é de 1 GB do plano Hobby e
 * **compartilhado entre todas as casas**, então uma casa (ou uma conta de ADMIN
 * comprometida) sem teto enche o storage e derruba o upload do app inteiro.
 *
 * Três decisões de espelhar `checkActiveTaskLimit`:
 * - `0` = sem limite **não gera nenhuma query** (o desligado não custa nada);
 * - conta os itens da **casa alvo** (`houseId` do form), e não da casa ativa — é o
 *   único jeito de o teto valer para todas as casas que o ADMIN controla;
 * - **erro de leitura libera o limite**: falhar por causa de uma contagem não pode
 *   impedir trabalho legítimo do tutor.
 */
async function checkChestItemLimit(
  admin: ReturnType<typeof createAdminClient>,
  houseId: string,
  maxItems: number
): Promise<string | null> {
  if (maxItems <= 0) return null

  const { count, error } = await admin
    .from('chest_items')
    .select('id', { count: 'exact', head: true })
    .eq('house_id', houseId)

  if (error) {
    console.error('[CHEST] Falha ao contar itens do baú:', error)
    return null
  }

  if ((count ?? 0) >= maxItems) {
    return `O baú desta casa já tem ${count} de ${maxItems} itens. Exclua algum ou aumente o limite em Configurações.`
  }

  return null
}

export async function createChestItem(input: {
  houseId: string
  title: string
  fileUrl: string
  fileName: string | null
  fileType: string
}): Promise<ActionResult<Tables<'chest_items'>>> {
  const admin = createAdminClient()

  const auth = await assertAdminCanManage(admin, input.houseId)
  if (!auth.ok) return auth

  // Teto de itens: barreira no servidor (a contagem na tela é só conveniência).
  const { maxItems } = await getHouseChestRulesSettings(input.houseId)
  const limitError = await checkChestItemLimit(admin, input.houseId, maxItems)
  if (limitError) return { ok: false, error: limitError }

  // A casa desligou os anexos do baú? (chave `attachments`, ADR-0026). Custo zero
  // de round-trip: o getter entra no mesmo `getHouseSettingsMap` do teto acima.
  // No baú o arquivo é obrigatório, então desligar isto equivale a pausar o
  // acervo — o ADMIN ainda abre o baú para **excluir** o que já existe.
  const attachments = await getHouseAttachmentSettings(input.houseId)
  if (!attachments.chestAllowed) {
    return {
      ok: false,
      error: 'A casa desativou os anexos no baú. Ligue a opção em Configurações para adicionar material.',
    }
  }

  const title = input.title.trim()
  const titleError = validateChestItemTitle(title)
  if (titleError) return { ok: false, error: titleError }

  const fileName = input.fileName?.trim() || null
  const fileType =
    input.fileType.trim().toLowerCase() ||
    attachmentTypeFromName(fileName ?? '') ||
    attachmentTypeFromUrl(input.fileUrl)

  // Fail-closed no servidor (ADR-0024, item 8): URL tem que estar no bucket, na
  // pasta `chest/`, e o tipo tem que estar na lista fechada. O `file.type` e a
  // URL chegam do browser, então nada aqui confia no cliente.
  const fileError = validateChestItemAttachment(input.fileUrl, fileName, fileType)
  if (fileError) return { ok: false, error: fileError }

  const { data, error } = await admin
    .from('chest_items')
    .insert({
      house_id: input.houseId,
      title,
      file_url: input.fileUrl,
      file_name: fileName,
      file_type: fileType,
      created_by: auth.adminId,
    })
    .select('*')
    .single()

  if (error || !data) {
    return { ok: false, error: 'Falha ao adicionar o item ao baú.' }
  }

  revalidateChest()
  return { ok: true, message: 'Item adicionado ao baú.', data }
}

/**
 * Título e arquivo mudam **de forma independente** (ADR-0024, item 7): trocar o
 * arquivo mantém o título, renomear mantém o arquivo. A casa **não** muda — a
 * lista mostra o item na casa em que ele nasceu, com chip quando não é a ativa.
 */
export async function updateChestItem(
  itemId: string,
  patch: {
    title?: string
    fileUrl?: string
    fileName?: string | null
    fileType?: string
  }
): Promise<ActionResult<Tables<'chest_items'>>> {
  const admin = createAdminClient()

  const loaded = await loadManagedItem(admin, itemId)
  if (!loaded.ok) return loaded
  const { item } = loaded

  const updates: Partial<Tables<'chest_items'>> = {}

  if (patch.title !== undefined) {
    const title = patch.title.trim()
    const titleError = validateChestItemTitle(title)
    if (titleError) return { ok: false, error: titleError }
    updates.title = title
  }

  // `null` no arquivo = trocar por um novo (o input devolve os 3 campos juntos).
  // Ausente = manter o que já está.
  if (patch.fileUrl !== undefined) {
    if (patch.fileUrl) {
      // A casa desligou os anexos do baú? (ADR-0026) — trocou/recriou material com
      // a opção desligada é recusado; renomear o item continua liberado (não
      // envolve anexo). Custo zero de round-trip (mesmo `getHouseSettingsMap`).
      const attachments = await getHouseAttachmentSettings(item.house_id)
      if (!attachments.chestAllowed) {
        return {
          ok: false,
          error: 'A casa desativou os anexos no baú. Ligue a opção em Configurações para trocar o material.',
        }
      }

      const fileName = patch.fileName?.trim() || null
      const fileType =
        patch.fileType?.trim().toLowerCase() ||
        attachmentTypeFromName(fileName ?? '') ||
        attachmentTypeFromUrl(patch.fileUrl)

      const fileError = validateChestItemAttachment(
        patch.fileUrl,
        fileName,
        fileType
      )
      if (fileError) return { ok: false, error: fileError }

      updates.file_url = patch.fileUrl
      updates.file_name = fileName
      updates.file_type = fileType
    } else {
      // Item do baú é acervo de arquivo: sem arquivo o item não tem o que abrir,
      // então a remoção é recusada aqui (a UI também não oferece).
      return {
        ok: false,
        error: 'Todo item do baú precisa ter um arquivo. Exclua o item se for isso.',
      }
    }
  }

  if (Object.keys(updates).length === 0) return { ok: true }

  updates.updated_at = new Date().toISOString()

  const { data, error } = await admin
    .from('chest_items')
    .update(updates)
    .eq('id', itemId)
    .eq('house_id', item.house_id)
    .select('*')
    .single()

  if (error || !data) {
    return { ok: false, error: 'Falha ao salvar o item do baú.' }
  }

  // Trocar o arquivo não pode deixar o antigo ocupando o bucket (1 GB do plano
  // Hobby) — só quando a URL realmente mudou.
  if (updates.file_url && updates.file_url !== item.file_url) {
    await removeStorageFile(admin, item.file_url, CHEST_ITEM_FOLDER, 'CHEST')
  }

  revalidateChest()
  return { ok: true, message: 'Item atualizado.', data }
}

/**
 * ADMIN exclui um item do baú. A linha some por delete; o arquivo sai do
 * storage em best-effort (o bucket é do plano Hobby — sem isso ele só cresceria).
 * A casa do item não é a casa ativa: é a casa **dele**, já conferida no
 * `loadManagedItem`.
 */
export async function deleteChestItem(itemId: string): Promise<ActionResult> {
  const admin = createAdminClient()

  const loaded = await loadManagedItem(admin, itemId)
  if (!loaded.ok) return loaded
  const { item } = loaded

  const { error } = await admin.from('chest_items').delete().eq('id', itemId)
  if (error) return { ok: false, error: 'Falha ao excluir o item do baú.' }

  await removeStorageFile(admin, item.file_url, CHEST_ITEM_FOLDER, 'CHEST')

  revalidateChest()
  return { ok: true, message: `Item "${item.title}" excluído.` }
}
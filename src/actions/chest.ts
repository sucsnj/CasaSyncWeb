'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/utils/supabase/admin'
import { getActiveAdminHouse, getSessionProfile } from '@/utils/house'
import {
  attachmentTypeFromName,
  CHEST_ITEM_FOLDER,
  validateChestItemAttachment,
  validateChestItemTitle,
} from '@/utils/chest-attachment'
import { removeStorageFile, storagePathFromUrl } from '@/utils/storage'
import {
  LINK_ATTACHMENT_TYPE,
  TASK_ATTACHMENT_FOLDER,
  validateAttachmentLink,
} from '@/utils/task-attachment'
import {
  checkAttachmentBudget,
  checkAttachmentFile,
  copyAttachmentObject,
  folderObjectSizes,
  newAttachmentPath,
  storageObjectBytes,
} from '@/utils/attachment-usage'
import {
  attachmentFileTooLargeError,
  attachmentFileTooLargeMessage,
  attachmentMissingFromStorageMessage,
} from '@/utils/attachment-budget'
import {
  getHouseAttachmentBudgetSettings,
  getHouseAttachmentSettings,
} from '@/utils/house-settings'
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
 * Cria um item no baú **da casa ativa**.
 *
 * A casa **não** vem do cliente: ela é derivada da sessão (`getActiveAdminHouse`),
 * igual a `applyPunishment`/`createDependent`. Isso é a consequência direta de o
 * baú ter deixado de ser um acervo do ADMIN e virar o acervo **da casa** — não há
 * mais "para qual casa" na tela, então também não há `houseId` no payload para
 * confiar. Trocar a casa ativa e abrir o baú de novo já mostra o acervo dela.
 *
 * O teto de **peso** (`attachment_budget`, ADR-0027) vive em
 * `checkAttachmentBudget` (`utils/attachment-usage.ts`): ele conta os bytes de
 * `tasks/` + `chest/` da casa, `0` não gera leitura nenhuma e **erro de leitura
 * libera** o limite. Aqui o arquivo novo **já está** no storage quando a
 * checagem roda (o upload é client-side), então ele entra sozinho na conta —
 * quem chama daqui não passa `pendingBytes`.
 */
export async function createChestItem(input: {
  title: string
  fileUrl: string
  fileName: string | null
  fileType: string
}): Promise<ActionResult<Tables<'chest_items'>>> {
  const admin = createAdminClient()

  const activeHouse = await getActiveAdminHouse()
  if (!activeHouse) {
    return { ok: false, error: 'Selecione uma casa antes de adicionar item ao baú.' }
  }

  const auth = await assertAdminCanManage(admin, activeHouse.id)
  if (!auth.ok) return auth

  // Teto de peso dos anexos da casa (chave `attachment_budget`): barreira no
  // servidor — o "N de M" na tela é só conveniência. O getter sai do mesmo
  // `getHouseSettingsMap` do toggle de anexos abaixo (custo zero de round-trip).
  const { maxMb } = await getHouseAttachmentBudgetSettings(activeHouse.id)
  const budgetError = await checkAttachmentBudget(admin, activeHouse.id, maxMb)
  if (budgetError) return { ok: false, error: budgetError }

  // A casa desligou os anexos do baú? (chave `attachments`, ADR-0026). Custo zero
  // de round-trip: o getter entra no mesmo `getHouseSettingsMap` do teto acima.
  // No baú o arquivo é obrigatório, então desligar isto equivale a pausar o
  // acervo — o ADMIN ainda abre o baú para **excluir** o que já existe.
  const attachments = await getHouseAttachmentSettings(activeHouse.id)
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

  // Teto de 5 MB por anexo + "o objeto existe?" — **fail closed** (ADR-0027): a URL
  // e o MIME chegam do browser, então quem confere o peso real é a leitura do
  // próprio objeto no storage. É o mesmo teto que o input valida antes de enviar,
  // no bucket (`file_size_limit`) e aqui — o cliente é conveniência, o bucket é
  // rede, e este é o que barra a gravação.
  const sizeError = await checkAttachmentFile(admin, input.fileUrl, fileType)
  if (sizeError) return { ok: false, error: sizeError }

  const { data, error } = await admin
    .from('chest_items')
    .insert({
      house_id: activeHouse.id,
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

      const sizeError = await checkAttachmentFile(admin, patch.fileUrl, fileType)
      if (sizeError) return { ok: false, error: sizeError }

      // Peso da casa (ADR-0027): o arquivo novo já está no storage (o upload é
      // client-side), então entra sozinho em `usedBytes`; o que a troca **libera**
      // é o arquivo que sai logo abaixo — sem descontar, uma casa no teto nunca
      // conseguiria trocar um material grande por um menor.
      if (patch.fileUrl !== item.file_url) {
        const { maxMb } = await getHouseAttachmentBudgetSettings(item.house_id)
        const freedBytes = (await storageObjectBytes(admin, item.file_url)) ?? 0
        const budgetError = await checkAttachmentBudget(admin, item.house_id, maxMb, {
          freedBytes,
        })
        if (budgetError) return { ok: false, error: budgetError }
      }

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

/* -------------------------------------------------------------------------- */
/* Réplica do baú para o anexo da tarefa (ADR-0027)                            */
/* -------------------------------------------------------------------------- */

/**
 * Opção do seletor "usar do baú" — só o **mínimo** que a tela precisa. O rótulo
 * do tipo (`Imagem`/`PDF`/`Link`) é calculado no client pelo mesmo helper puro do
 * anexo, então não há duas traduções do mesmo texto; o **tamanho** vem do servidor
 * porque só ele lê o storage (o app não guarda `file_size` em lugar nenhum).
 */
export type ChestAttachmentOption = {
  id: string
  title: string
  /** Tipo gravado no item (`image/png`, `text/html`, `text/url`, …). */
  fileType: string
  /** Bytes do arquivo; `null` em link (não ocupa storage) ou arquivo ausente. */
  bytes: number | null
}

/** Guarda da réplica: os dois toggles da casa (ADR-0026) têm de estar ligados. */
async function canReuseChestItem(
  houseId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const attachments = await getHouseAttachmentSettings(houseId)

  if (!attachments.tasksAllowed) {
    return {
      ok: false,
      error: 'A casa desativou os anexos em tarefas. Ligue a opção em Configurações para anexar material.',
    }
  }
  if (!attachments.chestAllowed) {
    return {
      ok: false,
      error: 'A casa desativou os anexos no baú. Ligue a opção em Configurações para usar material de lá.',
    }
  }
  return { ok: true }
}

export type ChestAttachmentCopy = { url: string; name: string | null; type: string }

/**
 * Resultado das duas actions de réplica, com **union explícita** em vez do
 * `ActionResult<T>` genérico: aqui `data` é obrigatório quando `ok`, e um
 * `data?` opcional obrigaria o chamador a inventar um fallback no `url` (que é
 * justamente o campo que não pode ter palpite).
 */
export type ChestAttachmentResult<T> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string }

/**
 * Lista o acervo do baú da **casa ativa** para o seletor de anexo da tarefa.
 *
 * **Carregada sob demanda** (só quando o ADMIN abre o seletor) e não no render
 * de `/tasks`: é uma leitura a mais numa tela quente, e o catálogo só interessa
 * depois que ele decide usar. O escopo é o mesmo do baú — item da casa ativa,
 * mais recentes primeiro.
 */
export async function listChestAttachmentsForTask(): Promise<
  ChestAttachmentResult<ChestAttachmentOption[]>
> {
  const admin = createAdminClient()

  const activeHouse = await getActiveAdminHouse()
  if (!activeHouse) {
    return { ok: false, error: 'Crie ou selecione uma casa primeiro.' }
  }

  const auth = await assertAdminCanManage(admin, activeHouse.id)
  if (!auth.ok) return auth

  const allowed = await canReuseChestItem(activeHouse.id)
  if (!allowed.ok) return allowed

  const { data: items, error } = await admin
    .from('chest_items')
    .select('id, title, file_url, file_type')
    .eq('house_id', activeHouse.id)
    .order('created_at', { ascending: false })

  if (error) {
    return { ok: false, error: 'Não foi possível carregar o baú da casa.' }
  }

  // Um `list` só (não um `info` por item): o tamanho real de todos os arquivos da
  // pasta numa ida. Falha aqui é só rótulo ausente — quem barra é o teto por
  // arquivo, na cópia.
  const sizes = await folderObjectSizes(admin, `${CHEST_ITEM_FOLDER}/${activeHouse.id}`).catch(
    (err) => {
      console.error('[CHEST] Falha ao ler o tamanho dos arquivos do baú:', err)
      return new Map<string, number>()
    }
  )

  const options: ChestAttachmentOption[] = (items ?? []).map((item) => {
    const path = storagePathFromUrl(item.file_url)
    const bytes = path ? (sizes.get(path) ?? null) : null
    return { id: item.id, title: item.title, fileType: item.file_type, bytes }
  })

  return { ok: true, data: options }
}

/**
 * **Réplica** do material de um item do baú para o anexo da tarefa: copia o
 * objeto de `chest/` para `tasks/` e devolve os 3 campos que o
 * `TaskAttachmentInput` grava na tarefa.
 *
 * Por que **copiar** e não apontar para o mesmo arquivo: a troca de anexo da
 * tarefa **apaga o arquivo antigo** (`removeStorageFile`, `updateTask`), e um
 * link/apontamento compartilhado apagaria material do baú — que é de outra
 * superfície e de outro público. Cópia é a única forma em que os dois lados
 * continuam independentes; e é o que o usuário pediu ("réplica").
 *
 * Autorização: ADMIN da **casa ativa** (é onde a tarefa vai nascer) e o item tem
 * de ser **dela** — item de outra casa devolve a mesma resposta de "não
 * encontrado", sem revelar existência. Os dois toggles da casa (tarefa + baú)
 * precisam estar ligados: com o baú desligado, ninguém deve conseguir levar o
 * material dele para uma tarefa, que é justamente reexibi-lo.
 *
 * **Link não tem o que copiar:** a "réplica" de um link é o próprio link (o
 * tipo `text/url` não ocupa storage). O arquivo é o único que gera bytes.
 */
export async function copyChestItemToTask(
  itemId: string
): Promise<ChestAttachmentResult<ChestAttachmentCopy>> {
  const admin = createAdminClient()

  const activeHouse = await getActiveAdminHouse()
  if (!activeHouse) {
    return { ok: false, error: 'Crie ou selecione uma casa primeiro.' }
  }

  const auth = await assertAdminCanManage(admin, activeHouse.id)
  if (!auth.ok) return auth

  const allowed = await canReuseChestItem(activeHouse.id)
  if (!allowed.ok) return allowed

  const { data: item } = await admin
    .from('chest_items')
    .select('id, title, file_url, file_name, file_type')
    .eq('id', itemId)
    .eq('house_id', activeHouse.id)
    .maybeSingle()

  if (!item) return { ok: false, error: 'Item do baú não encontrado.' }

  const fileType = (item.file_type ?? '').trim().toLowerCase()
  const fileUrl = item.file_url ?? ''

  if (!fileUrl) {
    return { ok: false, error: 'Este item do baú não tem material para copiar.' }
  }

  // Link: nada a copiar no storage — a réplica é o próprio endereço (que a
  // validação de link do anexo da tarefa vai revalidar na hora de salvar).
  if (fileType === LINK_ATTACHMENT_TYPE) {
    const linkError = validateAttachmentLink(fileUrl)
    if (linkError) return { ok: false, error: linkError }
    return { ok: true, data: { url: fileUrl, name: null, type: LINK_ATTACHMENT_TYPE } }
  }

  const fromPath = storagePathFromUrl(fileUrl)
  if (!fromPath) {
    return { ok: false, error: 'O arquivo deste item do baú não está no storage da casa.' }
  }

  // Fail closed no tamanho (ADR-0027): o item veio do baú, mas a validação é a
  // mesma do anexo enviado pelo browser — teto de 5 MB e objeto que existe.
  const bytes = await storageObjectBytes(admin, fileUrl)
  if (bytes === null) return { ok: false, error: attachmentMissingFromStorageMessage() }
  if (attachmentFileTooLargeError(bytes)) {
    return { ok: false, error: attachmentFileTooLargeMessage(bytes) }
  }

  // Peso da casa **antes** de copiar: aqui o arquivo destino ainda não existe, então
  // ele vai em `pendingBytes` (é o único lugar do app que precisa disso).
  const { maxMb } = await getHouseAttachmentBudgetSettings(activeHouse.id)
  const budgetError = await checkAttachmentBudget(admin, activeHouse.id, maxMb, {
    pendingBytes: bytes,
  })
  if (budgetError) return { ok: false, error: budgetError }

  const copied = await copyAttachmentObject(
    admin,
    fileUrl,
    newAttachmentPath(TASK_ATTACHMENT_FOLDER, activeHouse.id, fromPath)
  )
  if (!copied.ok) return { ok: false, error: copied.error }

  // Nome só para exibição: o do item do baú, ou o título + extensão quando o item
  // foi gravado sem nome de arquivo.
  const name =
    item.file_name?.trim() ||
    `${item.title}${fromPath.includes('.') ? fromPath.slice(fromPath.lastIndexOf('.')) : ''}`

  // A réplica consome budget e passa a existir em `tasks/`: as duas telas que
  // mostram o peso precisam do número novo.
  revalidateChest()
  revalidatePath('/tasks')

  return { ok: true, data: { url: copied.url, name, type: fileType } }
}
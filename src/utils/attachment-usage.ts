/**
 * Peso dos anexos no storage — **server-only** (lê o bucket com service-role).
 *
 * Este módulo é a **fonte da verdade de bytes**: o app não tem coluna
 * `file_size` em `tasks`/`chest_items` (ver ADR-0027), então o número vem do
 * próprio objeto, no bucket. Vantagens sobre uma coluna:
 *
 * - é **autoritativo** — o tamanho do arquivo que existe, não o que o cliente
 *   declarou nem o que foi salvo no momento do upload;
 * - **não diverge**: arquivo trocado, órfão de upload cancelado e réplica do baú
 *   entram na conta sozinhos, sem backfill nem trigger;
 * - **não exige migração**.
 *
 * Custo: cada checagem paga 1–2 round-trips de storage (~85 ms neste ambiente).
 * Por isso ele fica **fora do caminho de leitura** das telas — é chamado só nas
 * actions de escrita de anexo (e na tela do baú/Configurações, que já leem a
 * casa de qualquer jeito).
 *
 * ## Duas políticas de falha, deliberadamente diferentes
 * - **Teto por arquivo (5 MB) e "o objeto existe?"**: **fail closed**. A URL chega
 *   do browser; uma URL que não corresponde a um objeto real é o que a validação
 *   de pasta/tipo existe para barrar, e o conserto ("envie de novo") vale nos dois
 *   casos — objeto ausente ou leitura transitória.
 * - **Orçamento da casa**: **fail open**, espelhando `checkActiveTaskLimit`/
 *   `checkChestItemLimit`: uma falha transitória de storage não pode impedir o
 *   tutor de trabalhar. O risco de liberar é o mesmo de sempre (a casa estoura o
 *   teto), e é uma barreira de **disponibilidade**, não de segurança.
 */
import { MEDIA_BUCKET } from '@/utils/media'
import { storagePathFromUrl } from '@/utils/storage'
import {
  attachmentBudgetError,
  attachmentBudgetState,
  attachmentFileTooLargeMessage,
  attachmentFileTooLargeError,
  attachmentMissingFromStorageMessage,
  type AttachmentBudgetState,
} from '@/utils/attachment-budget'
import { isLinkAttachmentType, attachmentExtension } from '@/utils/task-attachment'
import type { createAdminClient } from '@/utils/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

/**
 * Pastas do bucket que contam no orçamento da casa. Só anexo: `messages/`,
 * `avatars/`, `houses/`, `rewards/`, `suggestions/` e `achievements/` têm regra
 * própria (ou nenhuma) e incluí-los tornaria o teto do "Limite de anexos"
 * imprevisível para quem lê.
 */
export const ATTACHMENT_BUDGET_FOLDERS = ['tasks', 'chest'] as const

/** A Storage API devolve no máximo 1000 itens por página. */
const LIST_PAGE = 1000
/**
 * Teto de páginas somadas por pasta (10 mil objetos). Casa com mais anexo que
 * isso já está além de qualquer teto razoável; o objetivo é só não transformar a
 * checagem numa leitura de página inteira.
 */
const MAX_LIST_PAGES = 10

/**
 * Bytes de UM objeto, ou `null` quando ele não existe (ou a leitura falhou — a
 * mensagem de recusa cobre os dois casos).
 *
 * O caminho vem de `storagePathFromUrl` (`utils/storage.ts`) — **o único parser de
 * URL do storage do app**. (Uma versão local desta função existia aqui com
 * `slice(at + 1)`, que mantinha o nome do bucket dentro do caminho e fazia o
 * `info()` responder "Object not found" para todo arquivo.)
 */
export async function storageObjectBytes(
  admin: AdminClient,
  url: string | null | undefined
): Promise<number | null> {
  const path = storagePathFromUrl(url)
  if (!path) return null

  const { data, error } = await admin.storage.from(MEDIA_BUCKET).info(path)
  if (error || !data) {
    console.error('[attachments] Não foi possível ler o tamanho do objeto:', path, error?.message ?? 'não encontrado')
    return null
  }

  // O `info()` devolve `size` no topo; o `metadata.size` (string) é o plano B
  // para quando a resposta vier no formato do `list()`. Sem nenhum dos dois, o
  // log abaixo deixa o motivo explícito: um "0 bytes" silencioso desligaria o
  // teto de 5 MB sem ninguém perceber.
  const bytes = Number(data.size ?? data.metadata?.size)
  if (!Number.isFinite(bytes) || bytes < 0) {
    console.warn('[attachments] Objeto sem tamanho legível:', path)
    return 0
  }
  return bytes
}

/** Soma os bytes de uma pasta do bucket (ignora o placeholder de pasta vazia). */
async function folderBytes(admin: AdminClient, folderPath: string): Promise<number> {
  const sizes = await folderObjectSizes(admin, folderPath)
  let total = 0
  for (const bytes of sizes.values()) total += bytes
  return total
}

/**
 * Bytes por objeto de uma pasta do bucket (`name` relativo → bytes), paginado.
 *
 * Serve dois callers com **uma** forma só de ler o storage: somar o peso da casa
 * e rotular os itens do baú com o tamanho real. `name` terminado em `/` é o
 * marcador de pasta que o Storage cria sozinho — não é arquivo e não tem tamanho.
 */
export async function folderObjectSizes(
  admin: AdminClient,
  folderPath: string
): Promise<Map<string, number>> {
  const sizes = new Map<string, number>()

  for (let page = 0; page < MAX_LIST_PAGES; page++) {
    const { data, error } = await admin.storage
      .from(MEDIA_BUCKET)
      .list(folderPath, { limit: LIST_PAGE, offset: page * LIST_PAGE })

    if (error) throw error

    for (const entry of data ?? []) {
      if (entry.name.endsWith('/')) continue
      const size = Number(entry.metadata?.size)
      if (Number.isFinite(size) && size > 0) sizes.set(entry.name, size)
    }

    if (!data || data.length < LIST_PAGE) return sizes
  }

  console.warn(
    `[attachments] Pasta "${folderPath}" com mais de ${MAX_LIST_PAGES * LIST_PAGE} objetos — leitura parcial.`
  )
  return sizes
}

/**
 * Caminho novo de anexo — mesmo formato do `uploadMedia` (`<folder>/<owner>/<uuid>.<ext>`),
 * com o nome original **fora** do path (serve só para exibição). A extensão vem
 * do arquivo de origem, para a réplica abrir igual ao original.
 */
export function newAttachmentPath(
  folder: string,
  ownerId: string,
  fromPath: string
): string {
  const extension = attachmentExtension(fromPath)
  const unique =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  return `${folder}/${ownerId}/${unique}${extension ? `.${extension}` : ''}`
}

/**
 * Quanto a casa **consome** em anexo, em bytes (`tasks/` + `chest/`).
 *
 * Usado na tela (para o "N de M") e dentro de `checkAttachmentBudget`. Lê
 * qualquer erro para o chamador decidir — quem chama no servidor libera o teto
 * (fail open) e quem chama para exibir devolve 0.
 */
export async function houseAttachmentBytes(
  admin: AdminClient,
  houseId: string
): Promise<number> {
  const folders = await Promise.all(
    ATTACHMENT_BUDGET_FOLDERS.map((folder) => folderBytes(admin, `${folder}/${houseId}`))
  )
  return folders.reduce((sum, bytes) => sum + bytes, 0)
}

/** Igual a {@link houseAttachmentBytes}, mas nunca lança (devolve 0 em falha). */
export async function safeHouseAttachmentBytes(
  admin: AdminClient,
  houseId: string
): Promise<number> {
  try {
    return await houseAttachmentBytes(admin, houseId)
  } catch (error) {
    console.error('[attachments] Falha ao somar o peso dos anexos da casa:', error)
    return 0
  }
}

/**
 * Estado do orçamento para a tela — os bytes vêm prontos do servidor (uma única
 * leitura por casa), então o componente não faz I/O nem recalcula nada.
 */
export function houseAttachmentBudgetState(
  usedBytes: number,
  maxMb: number,
  freedBytes = 0,
  pendingBytes = 0
): AttachmentBudgetState {
  return attachmentBudgetState(usedBytes, maxMb, freedBytes, pendingBytes)
}

/**
 * Teto por arquivo + existência do objeto — **fail closed**, e é a barreira real
 * do teto de 5 MB (o `accept` do input e a validação do client são só UX: o
 * `file.size` do browser não vale nada, e o bucket só barra depois que o upload
 * já consumiu bandwidth).
 *
 * Link não tem arquivo: sai antes de qualquer leitura.
 */
export async function checkAttachmentFile(
  admin: AdminClient,
  url: string,
  type: string | null | undefined
): Promise<string | null> {
  if (isLinkAttachmentType(type)) return null

  const bytes = await storageObjectBytes(admin, url)
  if (bytes === null) return attachmentMissingFromStorageMessage()
  if (attachmentFileTooLargeError(bytes)) return attachmentFileTooLargeMessage(bytes)
  return null
}

/**
 * Teto **por peso** da casa — fail open (ver o cabeçalho do módulo).
 *
 * `pendingBytes` é para o arquivo que ainda não existe no storage (a réplica do
 * baú, copiada depois desta checagem); nas actions de tarefa/baú o arquivo já foi
 * enviado pelo browser e **já está** em `usedBytes`, então elas passam 0 e
 * informam `freedBytes` do arquivo que a escrita vai apagar.
 */
export async function checkAttachmentBudget(
  admin: AdminClient,
  houseId: string,
  maxMb: number,
  options: { freedBytes?: number; pendingBytes?: number } = {}
): Promise<string | null> {
  if (maxMb <= 0) return null

  const usedBytes = await safeHouseAttachmentBytes(admin, houseId)
  return attachmentBudgetError(
    usedBytes,
    maxMb,
    options.freedBytes ?? 0,
    options.pendingBytes ?? 0
  )
}

/**
 * Réplica de um anexo do baú para a pasta de anexo da tarefa: **copia o objeto**
 * (server-side, sem baixar bytes para a função e reenviar), então o item do baú
 * continua intacto — é uma réplica, não uma transferência.
 *
 * Devolve a URL pública do novo objeto, ou a mensagem de erro.
 */
export async function copyAttachmentObject(
  admin: AdminClient,
  fromUrl: string,
  toPath: string
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const fromPath = storagePathFromUrl(fromUrl)
  if (!fromPath) {
    return { ok: false, error: 'O item do baú não tem arquivo válido para copiar.' }
  }

  const { error } = await admin.storage.from(MEDIA_BUCKET).copy(fromPath, toPath)
  if (error) {
    console.error('[attachments] Falha ao copiar anexo do baú:', fromPath, error.message)
    return {
      ok: false,
      error: 'Não foi possível copiar o material do baú. Tente novamente.',
    }
  }

  const { data } = admin.storage.from(MEDIA_BUCKET).getPublicUrl(toPath)
  return { ok: true, url: data.publicUrl }
}
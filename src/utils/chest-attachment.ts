/**
 * Anexo do **item do baú** — fachada sobre as regras puras do anexo da tarefa
 * (módulo sem `'use server'`, importado pelo client **e** pelas Server Actions).
 *
 * **Por que uma fachada e não um módulo novo:** o baú usa *exatamente* os mesmos
 * tipos, o mesmo teto de 5 MB e a mesma apresentação do anexo da tarefa
 * (ADR-0024, item 8). As regras que não dependem de pasta — lista fechada de
 * MIME, resolução por extensão, classificação (imagem/vídeo/PDF/página) e rótulo —
 * são **reexportadas** de `src/utils/task-attachment.ts`. Assim o dia em que um
 * tipo novo entrar no anexo da tarefa (ex.: áudio) vale no baú sem tocar aqui:
 * a lista fechada mora num lugar só.
 *
 * O que é **do baú** são duas coisas, ambas derivadas da mesma forma:
 *   1. a **pasta** do bucket (`chest/`) — a barreira que impede o ADMIN de
 *      apontar o item para uma URL externa;
 *   2. o `validateChestItemAttachment`, que é a validação fail-closed do item
 *      gravado (mesmas 3 defesas do anexo de tarefa: pasta, tipo, nome).
 */
import {
  attachmentExtension,
  attachmentKind,
  attachmentKindLabel,
  attachmentTypeFromName,
  formatAttachmentSize,
  isAllowedAttachmentType,
  resolveAttachmentType,
  TASK_ATTACHMENT_ACCEPT,
  TASK_ATTACHMENT_MAX_BYTES,
  TASK_ATTACHMENT_MAX_MB,
  TASK_ATTACHMENT_TYPES,
  type TaskAttachmentKind,
  type TaskAttachmentType,
} from '@/utils/task-attachment'

export {
  attachmentExtension,
  attachmentKind,
  attachmentKindLabel,
  attachmentTypeFromName,
  formatAttachmentSize,
  isAllowedAttachmentType,
  resolveAttachmentType,
  TASK_ATTACHMENT_ACCEPT,
  TASK_ATTACHMENT_MAX_BYTES,
  TASK_ATTACHMENT_MAX_MB,
  TASK_ATTACHMENT_TYPES,
  type TaskAttachmentKind,
  type TaskAttachmentType,
}

/**
 * Os tipos aceitos são **os mesmos da tarefa**, por decisão explícita de produto
 * — o reexport acima é o que garante que as duas listas não divergeem. Os nomes
 * mantêm o prefixo `TASK_` por compatibilidade com o módulo de origem; os
 * aliases abaixo são o nome que o baú usa.
 */
export const CHEST_ITEM_ATTACHMENT_TYPES = TASK_ATTACHMENT_TYPES
export const CHEST_ITEM_ATTACHMENT_MAX_MB = TASK_ATTACHMENT_MAX_MB
export const CHEST_ITEM_ATTACHMENT_MAX_BYTES = TASK_ATTACHMENT_MAX_BYTES
export const CHEST_ITEM_ATTACHMENT_ACCEPT = TASK_ATTACHMENT_ACCEPT
export type ChestItemAttachmentKind = TaskAttachmentKind

/** Pasta do bucket onde o arquivo do item vive (bucket público `casasync-media`). */
export const CHEST_ITEM_FOLDER = 'chest'

/** Limite do título — igual às conquistas (100). */
export const CHEST_ITEM_TITLE_MAX = 100

/**
 * Validação do item gravado — **fail closed**, no servidor.
 *
 * As 3 defesas são as mesmas de `validateTaskAttachment`, com a pasta do baú:
 * 1. a URL precisa ser do bucket público, na pasta `chest/` (o mesmo cuidado que
 *    a tarefa exige com `tasks/`, `sendQuickMessage` com `messages/` e
 *    `createAchievement` com `achievements/`);
 * 2. o tipo precisa estar na lista fechada (reexportada acima);
 * 3. o nome original é limitado a 120 caracteres e não pode trazer caractere de
 *    controle — ele é só para exibição, nunca entra no caminho do storage.
 */
export function validateChestItemAttachment(
  url: string,
  name: string | null | undefined,
  type: string | null | undefined
): string | null {
  if (
    !url.includes(`/${CHEST_ITEM_FOLDER}/`) ||
    !url.includes('/casasync-media/')
  ) {
    return 'Arquivo inválido: ele precisa estar no storage da casa.'
  }

  const resolved =
    (type ?? '').trim().toLowerCase() || attachmentTypeFromName(name ?? '')
  if (!isAllowedAttachmentType(resolved)) {
    return 'Formato não aceito. Envie imagem, vídeo, PDF ou página HTML.'
  }

  const safeName = (name ?? '').trim()
  if (safeName.length > 120) {
    return 'Nome do arquivo muito longo (máx. 120 caracteres).'
  }
  for (let i = 0; i < safeName.length; i++) {
    const code = safeName.charCodeAt(i)
    if (code < 32 || code === 127) return 'Nome do arquivo inválido.'
  }

  return null
}

/**
 * Título do item — obrigatório, 1–100 caracteres depois do `trim()`.
 *
 * Pode repetir de propósito (o baú não tem índice único): o que separa dois
 * itens com o mesmo título é o arquivo, e a busca é por título dos dois lados.
 */
export function validateChestItemTitle(title: string): string | null {
  const value = title.trim()
  if (value.length < 1) return 'Dê um título ao item do baú.'
  if (value.length > CHEST_ITEM_TITLE_MAX) {
    return `Título muito longo (máx. ${CHEST_ITEM_TITLE_MAX} caracteres).`
  }
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code < 32 || code === 127) return 'Título inválido.'
  }
  return null
}
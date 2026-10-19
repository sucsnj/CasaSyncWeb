/**
 * Orçamento de anexos **por peso (bytes)** — regras puras (módulo sem
 * `'use server'`, importado pelo client **e** pelas Server Actions).
 *
 * ## Por que peso, e não quantidade
 * O bucket `casasync-media` é do plano Hobby (**1 GB no total e compartilhado
 * entre todas as casas**). O que acaba com ele é o **volume**, não a contagem:
 * 50 itens de 5 MB são 250 MB, e 500 itens de 20 KB são 10 MB. Um teto por peso
 * é o que de fato protege o storage — e é a regra que o ADMIN consegue ler
 * ("100 MB por casa") em vez de um número que não tem relação com o problema.
 *
 * ## O que conta
 * Só as duas pastas de **anexo** da casa: `tasks/<houseId>/` e
 * `chest/<houseId>/`. Mensagem rápida, foto de perfil/casa/recompensa e imagem de
 * conquista **não** entram — são outros módulos, com regras próprias, e
 * incluí-los aqui tornaria o teto imprevisível (o ADMIN veria "100 MB" e não
 * saberia o que está ocupando). É um **limite honesto**: o consumo total da casa
 * no bucket é maior que o número mostrado.
 *
 * ## Onde os bytes vêm
 * Do próprio storage (`storage.objects` via a Storage API, service-role): não há
 * coluna `file_size` em `tasks`/`chest_items`, e inventar uma exigiria migração +
 * backfill que divergiria do arquivo real. Ler o objeto é **autoritativo** — o
 * número é o do arquivo, não o que o cliente disse que era.
 *
 * ## Um predicado só
 * `attachmentBudgetExceeded` é o mesmo que o servidor usa e que a tela mostra
 * (vermelho/aviso). Divergir os dois foi exatamente o tipo de coisa que já virou
 * bug neste app (contagem derivada no client x barreira no servidor), então a tela
 * recebe `usedBytes`/`limitBytes` prontos e não recalcula nada.
 */
import {
  TASK_ATTACHMENT_MAX_BYTES,
  TASK_ATTACHMENT_MAX_MB,
  formatAttachmentSize,
} from '@/utils/task-attachment'

export const MB = 1024 * 1024

/** Menor valor aceito: `0` = **sem teto**. */
export const ATTACHMENT_BUDGET_MIN_MB = 0
/**
 * Maior valor aceito (1 GB = o bucket inteiro). Acima disso o número deixa de
 * descrever o problema: uma casa não "tem" mais que o bucket.
 */
export const ATTACHMENT_BUDGET_MAX_MB = 1024

/**
 * Default **não é 0**: os outros tetres nascem desligados para não mudar o
 * comportamento de quem já usa, mas aqui o risco é justamente o cenário de
 * nenhum teto (uma casa enche o bucket e derruba o upload do app inteiro). Com
 * o teto de 5 MB por anexo, 100 MB ≈ 20 anexos cheios.
 */
/**
 * Default da configuração (o `DEFAULT_ATTACHMENT_BUDGET` de `utils/settings.ts`
 * reexporta este número). Mora **aqui** porque é o valor do orçamento, e a config
 * não pode ter fonte própria: o teto mostrado na tela e o teto gravado no banco
 * são o mesmo número.
 */
export const ATTACHMENT_BUDGET_DEFAULT_MB = 100

/** A partir de 80% do teto a tela avisa (mesma faixa do antigo aviso de itens). */
export const ATTACHMENT_BUDGET_NEAR_RATIO = 0.8

/** MB → bytes. `0`, negativo ou não-finite viram `0` (= sem teto). */
export function mbToBytes(mb: number): number {
  if (!Number.isFinite(mb) || mb <= 0) return 0
  return Math.round(mb * MB)
}

/** O teto como o texto do campo ("100 MB"), sem vírgula — é um valor configurado. */
export function formatMb(mb: number): string {
  return `${mb} MB`
}

/**
 * O teto foi atingido? Predicado **único** (servidor + tela).
 *
 * `limitBytes = 0` (sem teto) nunca estoura. O resto usa `>=`: uma casa que já
 * chegou em 100 MB não cabe mais nada — é a leitura de "orçamento", não de
 * "estourou".
 */
export function attachmentBudgetExceeded(
  countedBytes: number,
  limitBytes: number
): boolean {
  return limitBytes > 0 && countedBytes >= limitBytes
}

/**
 * O que a casa **consome** depois desta escrita.
 *
 * - `usedBytes`: bytes já no storage **no momento da checagem**;
 * - `freedBytes`: bytes do arquivo que esta escrita vai **apagar** (trocar o
 *   anexo da tarefa, trocar o arquivo do item) — ele já está em `usedBytes`, e
 *   contá-lo junto tornaria a troca impossível justamente quando a casa está no
 *   teto;
 * - `pendingBytes`: bytes que serão acrescentados e **ainda não** estão em
 *   `usedBytes` (ex.: a réplica do baú, que é contada antes de existir).
 *
 * Os dois últimos defaultam a 0, então quem não tem troca nem pendência passa
 * só o que já usou.
 */
export function attachmentBudgetCounted(
  usedBytes: number,
  maxMb: number,
  freedBytes = 0,
  pendingBytes = 0
): number {
  const used = Number.isFinite(usedBytes) ? Math.max(0, usedBytes) : 0
  const freed = Number.isFinite(freedBytes) ? Math.max(0, freedBytes) : 0
  const pending = Number.isFinite(pendingBytes) ? Math.max(0, pendingBytes) : 0
  return Math.max(0, used - freed + pending)
}

/** Estado pronto para a tela (barreira de proximidade + texto), sem I/O. */
export type AttachmentBudgetState = {
  /** Bytes que a casa vai consumir depois da escrita. */
  countedBytes: number
  /** Teto em bytes (`0` = sem teto). */
  limitBytes: number
  /** Quanto ainda cabe (`0` quando não há teto). */
  freeBytes: number
  /** 80% do teto ou mais. */
  near: boolean
  /** Sem espaço para mais nada. */
  reached: boolean
}

export function attachmentBudgetState(
  usedBytes: number,
  maxMb: number,
  freedBytes = 0,
  pendingBytes = 0
): AttachmentBudgetState {
  const countedBytes = attachmentBudgetCounted(usedBytes, maxMb, freedBytes, pendingBytes)
  const limitBytes = mbToBytes(maxMb)
  const reached = attachmentBudgetExceeded(countedBytes, limitBytes)
  return {
    countedBytes,
    limitBytes,
    freeBytes: limitBytes > 0 ? Math.max(0, limitBytes - countedBytes) : 0,
    near: limitBytes > 0 && !reached && countedBytes >= Math.floor(limitBytes * ATTACHMENT_BUDGET_NEAR_RATIO),
    reached,
  }
}

/**
 * Mensagem de recusa do servidor (o que o ADMIN lê ao tentar anexar) — pura,
 * para a tela e a action mostrarem **a mesma** frase.
 *
 * `pendingBytes` entra na conta quando a cópia ainda não existe; o texto cita o
 * total que a casa ficaria, então ele não mente sobre "já está no limite".
 */
export function attachmentBudgetError(
  usedBytes: number,
  maxMb: number,
  freedBytes = 0,
  pendingBytes = 0
): string | null {
  const limitBytes = mbToBytes(maxMb)
  if (limitBytes <= 0) return null

  const state = attachmentBudgetState(usedBytes, maxMb, freedBytes, pendingBytes)
  if (!state.reached) return null

  return `O limite de anexos desta casa foi atingido (${formatMb(maxMb)}). Exclua algum anexo, troque um material maior por um menor ou aumente o limite em Configurações.`
}

/**
 * Teto de **um** anexo. O mesmo número vive no cliente (antes de gastar upload),
 * no bucket (`storage.buckets.file_size_limit`, ver `docs/sql/`) e aqui — que é o
 * que barra de fato, porque o `file.size` do browser não vale nada.
 */
export function attachmentFileTooLargeError(bytes: number): boolean {
  return Number.isFinite(bytes) && bytes > TASK_ATTACHMENT_MAX_BYTES
}

/** Texto do teto por arquivo, para a tela e para a action recusarem igual. */
export function attachmentFileTooLargeMessage(bytes: number): string {
  return `O arquivo tem ${formatAttachmentSize(bytes)} e o teto por anexo é ${TASK_ATTACHMENT_MAX_MB} MB. Envie um arquivo menor.`
}

/**
 * Arquivo declarado no anexo que **não existe** no storage.
 *
 * Fail closed de propósito: a URL chega do browser, e uma URL que não corresponde
 * a um objeto real é exatamente o que a validação de pasta/tipo tenta evitar (o
 * ADMIN apontaria a tarefa para um arquivo que ele não controla). A mensagem é
 * written para serve nos dois casos — objeto ausente **ou** falha transitória de
 * leitura — porque "envie o anexo de novo" resolve os dois.
 */
export function attachmentMissingFromStorageMessage(): string {
  return 'Não foi possível confirmar o arquivo enviado no storage. Envie o anexo de novo.'
}
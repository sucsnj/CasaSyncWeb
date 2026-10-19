import { MEDIA_BUCKET } from './media'

/**
 * Caminho de um arquivo do bucket a partir da **URL pública** — ou `null` quando
 * a URL não for do bucket.
 *
 * ## Por que isto mora aqui, e é o único lugar
 * O app precisa transformar URL em caminho em três lugares (conferir o tamanho
 * do anexo, apagar o arquivo antigo, apagar a imagem da conquista) e cada um
 * reimplementou a mesma conta de caractere — **e duas das três estavam erradas**,
 * com o `slice(at + 1)` cortando o `/` mas mantendo o **nome do bucket** dentro do
 * caminho. O efeito era silencioso e em duas formas: `info()` respondia *"Object
 * not found"* para todo arquivo (que era o sintoma), e o `remove()` recebia um
 * caminho inexistente — então **trocar/excluir anexo nunca apagou o arquivo
 * antigo** de verdade.
 *
 * A conta agora é feita **depois do marcador inteiro** (`/{bucket}/`), e o
 * resultado é conferido pelo chamador (pasta esperada), que é a guarda que impede
 * apagar algo de outro módulo.
 *
 * A query é descartada: a URL pública do Supabase não costuma ter query, mas se
 * vier não faz parte do nome do objeto.
 */
export function storagePathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null

  const marker = `/${MEDIA_BUCKET}/`
  try {
    const { pathname } = new URL(url)
    const at = pathname.indexOf(marker)
    if (at === -1) return null
    const path = pathname.slice(at + marker.length)
    return path.length > 0 ? path : null
  } catch {
    // URL inválida: não é caminho de storage.
    return null
  }
}

/**
 * Remoção de arquivo do bucket `casasync-media` no **servidor** — best-effort,
 * nunca derruba a ação principal.
 *
 * **Por que existe separada do `uploadMedia`:** upload é client-side (a Storage
 * API do browser), e apagar o arquivo antigo é do servidor (service-role), que é
 * quem tem o caminho completo. Sem isso o storage só cresceria a cada troca — e
 * o bucket é do plano Hobby (1 GB no total).
 *
 * **A guarda de pasta é a parte que importa:** `folder` precisa casar com o
 * prefixo do caminho, então um ADMIN que aponte a URL para um arquivo de outra
 * pasta (ou para fora do bucket) não apaga nada alheio por engano. É a mesma
 * defesa que a validação do lado da escrita já exige (`validateTaskAttachment`
 * com `tasks/`, `sendQuickMessage` com `messages/`), aqui do lado da leitura do
 * caminho.
 */
export async function removeStorageFile(
  admin: {
    storage: {
      from: (bucket: string) => {
        remove: (paths: string[]) => PromiseLike<{ error: { message: string } | null }>
      }
    }
  },
  url: string | null | undefined,
  folder: string,
  logLabel = 'STORAGE'
): Promise<void> {
  const path = storagePathFromUrl(url)
  if (!path) return

  // Só remove o que é realmente da pasta pedida — nunca toca em nada que o
  // ADMIN tenha apontado por engano (URL externa ou de outro módulo).
  if (!path.startsWith(`${folder}/`)) return

  try {
    const { error } = await admin.storage.from(MEDIA_BUCKET).remove([path])
    if (error) {
      console.error(`[${logLabel}] Falha ao remover arquivo antigo:`, error.message)
    }
  } catch (err) {
    console.error(`[${logLabel}] Falha ao remover arquivo antigo:`, err)
  }
}
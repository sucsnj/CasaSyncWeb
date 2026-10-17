import { MEDIA_BUCKET } from './media'

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
  if (!url) return

  const at = url.indexOf(`/${MEDIA_BUCKET}/`)
  if (at === -1) return

  const path = url.slice(at + 1).split('?')[0]
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
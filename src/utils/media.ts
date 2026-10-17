import { createClient } from '@/utils/supabase/client'

export const MEDIA_BUCKET = 'casasync-media'

export type MediaFolder =
  | 'avatars'
  | 'houses'
  | 'rewards'
  | 'tasks'
  | 'suggestions'
  | 'messages'
  | 'achievements'
  | 'chest'

/**
 * MIME por extensão, para os casos em que o browser entrega `file.type` vazio
 * (comum em `.html` e `.mov`).
 *
 * **Por que isso importa:** o content-type gravado no storage é o que decide se
 * o browser RENDERIZA ou BAIXA o arquivo. Sem content-type (ou com
 * `application/octet-stream`), abrir a URL baixa o arquivo em vez de mostrar a
 * página — que é exatamente o defeito do anexo em HTML.
 */
const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  pdf: 'application/pdf',
  html: 'text/html',
  htm: 'text/html',
}

function contentTypeFor(file: File, extension: string): string {
  const declared = (file.type ?? '').split(';')[0].trim()
  if (declared) return declared
  return CONTENT_TYPE_BY_EXTENSION[extension] ?? 'application/octet-stream'
}

/**
 * Identificador único para o nome do arquivo. `crypto.randomUUID` só existe em
 * contexto seguro (HTTPS/localhost) — fora dele (ex.: acesso por `http://<ip>`)
 * usamos um fallback aleatório + timestamp (não precisa ser UUID válido no path
 * do storage, apenas único).
 */
function randomFileId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

/**
 * Upload de arquivo para o bucket público `casasync-media`, dentro da pasta do
 * dono (`folder/id/<uuid>.<ext>`). Retorna a URL pública ou `null` em falha.
 *
 * O caminho é sempre um **UUID** — o nome original do arquivo NUNCA entra no
 * path (serve só para exibição no card).
 *
 * Uso exclusivamente client-side (browser storage API do Supabase).
 */
export async function uploadMedia(
  folder: MediaFolder,
  file: File,
  id: string
): Promise<string | null> {
  const supabase = createClient()
  const ext =
    file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? 'jpg'
  const path = `${folder}/${id}/${randomFileId()}.${ext}`

  try {
    const { error } = await supabase.storage
      .from(MEDIA_BUCKET)
      .upload(path, file, {
        contentType: contentTypeFor(file, ext),
        upsert: false,
      })

    if (error) throw error

    const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path)
    return data.publicUrl
  } catch (err) {
    console.error('uploadMedia falhou:', { folder, id, path }, err)
    throw err instanceof Error
      ? err
      : new Error('Falha ao enviar a imagem. Tente novamente.')
  }
}
import { createClient } from '@/utils/supabase/client'

export const MEDIA_BUCKET = 'casasync-media'

export type MediaFolder =
  | 'avatars'
  | 'houses'
  | 'rewards'
  | 'tasks'
  | 'suggestions'
  | 'messages'

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
 * Upload de imagem para o bucket público `casasync-media`, dentro da pasta do
 * dono (`folder/id/<uuid>.<ext>`). Retorna a URL pública ou `null` em falha.
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
      .upload(path, file, { contentType: file.type, upsert: false })

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
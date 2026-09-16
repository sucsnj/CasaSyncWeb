import { createClient } from '@/utils/supabase/client'

export const MEDIA_BUCKET = 'casasync-media'

export type MediaFolder = 'avatars' | 'houses' | 'rewards' | 'tasks' | 'suggestions'

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
  const path = `${folder}/${id}/${crypto.randomUUID()}.${ext}`

  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })

  if (error) return null

  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path)
  return data.publicUrl
}
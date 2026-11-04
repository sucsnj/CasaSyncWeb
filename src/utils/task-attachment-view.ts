import type { Tables } from '@/types/database'
import type { ChestItemView } from '@/components/chest/chest-types'

export type TaskAttachmentViewData = {
  url: string
  name: string | null
  type: string | null
  htmlHref: string
  isMirror: boolean
}

/**
 * Resolve o anexo de uma tarefa para exibição/interação. Espelho do baú usa o
 * id do item; sem mapa, consideramos ausente (desensitivizado).
 */
export function taskAttachmentView(
  task: Tables<'tasks'>,
  chestItems: Record<string, ChestItemView>
): TaskAttachmentViewData | null {
  if (task.attachment_chest_item_id) {
    const item = chestItems[task.attachment_chest_item_id]
    if (!item) return null
    return {
      url: item.file_url,
      name: item.file_name?.trim() || null,
      type: item.file_type,
      htmlHref: `/abrir-anexo?kind=chest&id=${item.id}`,
      isMirror: true,
    }
  }

  if (!task.image_url) return null

  return {
    url: task.image_url,
    name: task.attachment_name,
    type: task.attachment_type,
    htmlHref: `/abrir-anexo?kind=task&id=${task.id}`,
    isMirror: false,
  }
}
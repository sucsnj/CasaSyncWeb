import type { Tables } from '@/types/database'

/**
 * Item do baú como chega ao client: a linha de `chest_items` mais o **nome da
 * casa**, resolvido no servidor.
 *
 * O nome vem por prop (não por consulta do browser) pelo mesmo motivo das casas
 * do sino: o app lê `houses` por service-role (ADR-0006), e o chip de "outra
 * casa" precisa do nome antes do clique.
 */
export type ChestItemView = Tables<'chest_items'> & {
  /** `null` quando o nome não pôde ser resolvido (casa removida no meio do read). */
  houseName: string | null
}
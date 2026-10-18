import type { Tables } from '@/types/database'

/**
 * Item do baú como chega ao client.
 *
 * É a **linha crua** de `chest_items`, sem nome de casa: o acervo passou a ser
 * **da casa ativa** (emenda "baú por casa" no ADR-0024), então todos os itens da
 * lista são da mesma casa e o chip de "outra casa" saiu junto com o select que
 * permitia escolher para onde o item ia.
 */
export type ChestItemView = Tables<'chest_items'>
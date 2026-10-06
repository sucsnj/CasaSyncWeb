/**
 * Estilos visuais por status de tarefa — indicador de borda esquerda (accent)
 * + chip de status. Atalho para manter ADMIN e DEPENDENT consistentes.
 */

import type { TaskSlaStatus } from '@/utils/task-sla'

export const taskAccentByStatus = {
  PENDING: 'border-l-blue-500',
  IN_PROGRESS: 'border-l-sky-500',
  COMPLETED: 'border-l-amber-400',
  APPROVED: 'border-l-emerald-500',
  NOT_DELIVERED: 'border-l-red-600',
  ON_HOLD: 'border-l-slate-400',
} as const

export const taskChipByStatus = {
  PENDING: { label: 'Pendente', className: 'bg-sky-100 text-sky-700' },
  IN_PROGRESS: { label: 'Em andamento', className: 'bg-sky-100 text-sky-700' },
  COMPLETED: {
    label: 'Aguardando aprovação',
    className: 'bg-amber-100 text-amber-700',
  },
  APPROVED: { label: 'Concluída', className: 'bg-emerald-50 text-emerald-700' },
  NOT_DELIVERED: {
    label: 'Não entregue',
    className: 'bg-red-100 text-red-700',
  },
  ON_HOLD: { label: 'Em espera', className: 'bg-slate-100 text-slate-600' },
} as const

export const POINTS_PILL_CLASS = 'bg-amber-100 text-amber-700'

/**
 * Chip do **pedido de adiamento pendente** — o aviso que precisa aparecer sem
 * que ninguém expanda o card, para os DOIS lados.
 *
 * Azul + `Clock3`: é a identidade que já existia no card do dependente e no
 * banner do ADMIN (`border-blue-200 bg-blue-50`, `Clock3 size-4`) — o chip é a
 * mesma coisa em miniatura. O `blue-100`/`blue-800` com `font-semibold` é o que
 * faz o chip **ler** no card branco: a versão `blue-50` do dependente ficava
 * quase invisível ao lado do `sky-100` do chip de status.
 *
 * `flex`/`gap-1` e o `padding` menor (`px-2`) são o shape do chip **com
 * ícone**; os chips de status acima são sem ícone e usam `px-2.5 py-1`.
 */
export const taskExtensionChip = {
  label: 'Pedido de adiamento',
  className:
    'flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800',
} as const

export type TaskStatus = keyof typeof taskChipByStatus

/** Sobrescreve o card inteiro quando o prazo está em risco/atrasado. */
export const taskSlaCardClass: Record<TaskSlaStatus, string> = {
  overdue: 'border-l-4 border-red-500 bg-red-50 text-red-700',
  dueSoon: 'border-l-4 border-amber-400 bg-amber-50 text-amber-800',
  normal: 'border-l-4',
}

export const taskSlaBadge: Record<
  TaskSlaStatus,
  { label: string; className: string } | null
> = {
  overdue: { label: 'Atrasada', className: 'bg-red-100 text-red-700' },
  dueSoon: {
    label: 'Prazo próximo',
    className: 'bg-amber-100 text-amber-800',
  },
  normal: null,
}
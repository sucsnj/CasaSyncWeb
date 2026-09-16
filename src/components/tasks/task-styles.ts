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
} as const

export const taskChipByStatus = {
  PENDING: { label: 'Pendente', className: 'bg-sky-100 text-sky-700' },
  IN_PROGRESS: { label: 'Em andamento', className: 'bg-sky-100 text-sky-700' },
  COMPLETED: {
    label: 'Aguardando aprovação',
    className: 'bg-amber-100 text-amber-700',
  },
  APPROVED: { label: 'Concluída', className: 'bg-emerald-50 text-emerald-700' },
} as const

export const POINTS_PILL_CLASS = 'bg-amber-100 text-amber-700'

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
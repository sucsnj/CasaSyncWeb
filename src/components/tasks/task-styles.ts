/**
 * Estilos visuais por status de tarefa — indicador de borda esquerda (accent)
 * + chip de status. Atalho para manter ADMIN e DEPENDENT consistentes.
 */

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
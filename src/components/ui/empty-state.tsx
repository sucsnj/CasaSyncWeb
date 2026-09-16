import type { LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

export function EmptyState({
  icon: Icon,
  title,
  message,
  accent = 'bg-sky-100 text-sky-600',
}: {
  icon: LucideIcon
  title: string
  message: string
  accent?: string
}) {
  return (
    <Card className="border-dashed border-slate-300 shadow-none">
      <CardContent className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <span
          className={`flex size-16 items-center justify-center rounded-full ${accent}`}
        >
          <Icon className="size-8" />
        </span>
        <p className="font-semibold text-slate-700">{title}</p>
        <p className="text-sm text-slate-500">{message}</p>
      </CardContent>
    </Card>
  )
}
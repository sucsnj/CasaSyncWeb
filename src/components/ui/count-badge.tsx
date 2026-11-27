import { cn } from '@/lib/utils'

export function CountBadge({
  count,
  className,
}: {
  count: number
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex min-w-6 items-center justify-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700',
        className
      )}
    >
      {count}
    </span>
  )
}

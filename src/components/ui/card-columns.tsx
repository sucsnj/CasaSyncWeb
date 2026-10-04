import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function CardColumns({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('columns-1 [&>*]:break-inside-avoid', className)}>
      {children}
    </div>
  )
}

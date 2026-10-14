import { PageSkeleton } from '@/components/ui/page-skeleton'

// Sem `header`: a nav real fica no `layout.tsx` do grupo `(app)`, que roda
// ACIMA deste boundary — só o conteúdo é substituído durante a navegação.
export default function Loading() {
  return <PageSkeleton hero cards={3} />
}
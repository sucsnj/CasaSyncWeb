import Link from 'next/link'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

/** Card de "sem casa ativa" — usado pelas telas quando o shell não tem casa. */
export function NoHouseCard({ role }: { role: 'ADMIN' | 'DEPENDENT' }) {
  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>Nenhuma casa ativa</CardTitle>
        <CardDescription>
          {role === 'ADMIN'
            ? 'Crie ou selecione uma casa antes de gerenciar o conteúdo.'
            : 'Você ainda não foi vinculado a uma casa.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {role === 'ADMIN' ? (
          <Link
            href="/dashboard/admin/houses"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Gerenciar casas →
          </Link>
        ) : null}
      </CardContent>
    </Card>
  )
}

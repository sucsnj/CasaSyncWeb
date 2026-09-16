'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createDependent, createHouse, selectHouse } from '@/actions/houses'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type HousesManagerProps = {
  houses: { id: string; name: string }[]
  activeHouseId: string | null
  activeHouseName: string | null
  members: { profileId: string; fullName: string; role: 'ADMIN' | 'DEPENDENT' }[]
}

export function HousesManager({
  houses,
  activeHouseId,
  activeHouseName,
  members,
}: HousesManagerProps) {
  const router = useRouter()
  const [houseName, setHouseName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const [depError, setDepError] = useState<string | null>(null)
  const [depPending, setDepPending] = useState(false)
  const [showHouseForm, setShowHouseForm] = useState(false)
  const [showDependentForm, setShowDependentForm] = useState(false)

  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    startTransition(async () => {
      const result = await createHouse(houseName)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setHouseName('')
      setShowHouseForm(false)
      router.refresh()
    })
  }

  async function handleCreateDependent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    // currentTarget é nulled após o primeiro await — capturar a referência
    // do form agora para poder chamar reset() depois do createDependent.
    const form = event.currentTarget

    setDepError(null)
    setDepPending(true)

    try {
      if (!activeHouseId) {
        setDepError('Crie ou selecione uma casa antes de adicionar dependentes.')
        return
      }

      // Segurança: a senha do dependente fica só na DOM (input uncontrolled) e é
      // lida do FormData no submit. NUNCA entra em estado React.
      const formData = new FormData(form)
      const depName = String(formData.get('dependentName') ?? '').trim()
      const depUsername = String(formData.get('dependentUsername') ?? '').trim()
      const depPassword = String(formData.get('dependentPassword') ?? '')

      const result = await createDependent(
        depName,
        depUsername,
        depPassword,
        activeHouseId
      )

      if (!result.ok) {
        setDepError(result.error)
        return
      }

      form.reset()
      setShowDependentForm(false)
      router.refresh()
    } finally {
      setDepPending(false)
    }
  }

  function handleSelect(houseId: string) {
    startTransition(async () => {
      const result = await selectHouse(houseId)
      if (!result.ok) setError(result.error)
      router.refresh()
    })
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Nova casa</CardTitle>
            <CardDescription>
              A casa criada passa a ser a casa ativa e você vira o administrador dela.
            </CardDescription>
          </div>
          <CardAction>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowHouseForm((value) => !value)}
            >
              {showHouseForm ? 'Fechar' : 'Nova casa'}
            </Button>
          </CardAction>
        </CardHeader>
        {showHouseForm ? (
          <CardContent>
            <form onSubmit={handleCreate} className="flex flex-col gap-3">
              <div className="grid gap-2">
                <Label htmlFor="house-name">Nome da casa</Label>
                <Input
                  id="house-name"
                  name="houseName"
                  type="text"
                  placeholder="Ex.: Família Silva"
                  value={houseName}
                  onChange={(event) => setHouseName(event.target.value)}
                  required
                />
              </div>

              {error ? (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}

              <Button type="submit" disabled={pending}>
                {pending ? 'Criando...' : 'Criar casa'}
              </Button>
            </form>
          </CardContent>
        ) : null}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Suas casas</CardTitle>
          <CardDescription>
            Clique para alternar a casa ativa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {houses.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma casa ainda. Crie a primeira acima.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {houses.map((house) => {
                const active = house.id === activeHouseId
                return (
                  <button
                    key={house.id}
                    type="button"
                    onClick={() => handleSelect(house.id)}
                    disabled={pending || active}
                    data-active={active}
                    className={cn(
                      'flex items-center justify-between rounded-xl border border-slate-200/80 bg-white px-3 py-3 text-left text-sm shadow-sm transition-colors',
                      'hover:bg-muted disabled:cursor-default data-active:border-blue-600 data-active:bg-sky-50'
                    )}
                  >
                    <span className="font-medium">{house.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {active ? 'Ativa' : 'Alternar'}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Novo dependente</CardTitle>
            <CardDescription>
              Cria a conta do dependente e o vincula à casa ativa.
            </CardDescription>
          </div>
          <CardAction>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!activeHouseId}
              onClick={() => setShowDependentForm((value) => !value)}
            >
              {showDependentForm ? 'Fechar' : 'Novo dependente'}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {!activeHouseId ? (
            <p className="text-sm text-muted-foreground">
              Selecione ou crie uma casa ativa para adicionar dependentes.
            </p>
          ) : showDependentForm ? (
            <form
              onSubmit={handleCreateDependent}
              className="flex flex-col gap-3"
            >
              <div className="grid gap-2">
                <Label htmlFor="dependent-name">Nome completo</Label>
                <Input
                  id="dependent-name"
                  name="dependentName"
                  type="text"
                  placeholder="Ex.: Joana Silva"
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="dependent-username">Nome de usuário</Label>
                <Input
                  id="dependent-username"
                  name="dependentUsername"
                  type="text"
                  autoComplete="username"
                  placeholder="ex.: joana_silva"
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="dependent-password">Senha</Label>
                <Input
                  id="dependent-password"
                  name="dependentPassword"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Mínimo de 6 caracteres"
                  suppressHydrationWarning
                  required
                  minLength={6}
                />
              </div>

              {depError ? (
                <p className="text-sm text-destructive" role="alert">
                  {depError}
                </p>
              ) : null}

              <Button type="submit" disabled={depPending}>
                {depPending ? 'Criando...' : 'Criar dependente'}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              Toque em &quot;Novo dependente&quot; para adicionar alguém à casa ativa.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>
            Membros {activeHouseName ? `de ${activeHouseName}` : ''}
          </CardTitle>
          <CardDescription>
            Dependentes vinculados à casa ativa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!activeHouseId ? (
            <p className="text-sm text-muted-foreground">
              Selecione ou crie uma casa para ver os membros.
            </p>
          ) : members.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum membro vinculado ainda. Use o formulário para criar o
              primeiro dependente.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {members.map((member) => (
                <li
                  key={member.profileId}
                  className="flex items-center justify-between rounded-lg border border-input px-3 py-2 text-sm"
                >
                  <span className="font-medium">{member.fullName}</span>
                  <span
                    data-role={member.role.toLowerCase()}
                    className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500 data-[role=admin]:bg-sky-100 data-[role=admin]:text-sky-700"
                  >
                    {member.role === 'ADMIN' ? 'Administrador' : 'Dependente'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
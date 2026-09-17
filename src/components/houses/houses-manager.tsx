'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  createDependent,
  createHouse,
  joinHouseByPin,
  selectHouse,
  updateDependentProfile,
  updateHouse,
} from '@/actions/houses'
import { ImageUpload } from '@/components/ui/image-upload'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Copy, Pencil } from 'lucide-react'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type House = { id: string; name: string; image_url: string | null; code: string }
type Member = {
  profileId: string
  fullName: string
  username: string | null
  avatarUrl: string | null
  role: 'ADMIN' | 'DEPENDENT'
}

type HousesManagerProps = {
  houses: House[]
  activeHouseId: string | null
  activeHouseName: string | null
  activeHouseImageUrl: string | null
  members: Member[]
}

export function HousesManager({
  houses,
  activeHouseId,
  activeHouseName,
  activeHouseImageUrl,
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
  const [houseMode, setHouseMode] = useState<'create' | 'join'>('create')

  const [editingHouse, setEditingHouse] = useState<House | null>(null)
  const [houseImageUrl, setHouseImageUrl] = useState<string | null>(null)

  const [editingDependent, setEditingDependent] = useState<Member | null>(null)
  const [dependentAvatarUrl, setDependentAvatarUrl] = useState<string | null>(
    null
  )

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

  function handleJoin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    setError(null)

    startTransition(async () => {
      const result = await joinHouseByPin(
        String(new FormData(form).get('pin') ?? '')
      )
      if (!result.ok) {
        setError(result.error)
        return
      }
      setShowHouseForm(false)
      router.refresh()
    })
  }

  function copyPin(code: string) {
    void navigator.clipboard?.writeText(code)
  }

  async function handleCreateDependent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    setDepError(null)
    setDepPending(true)

    try {
      if (!activeHouseId) {
        setDepError('Crie ou selecione uma casa antes de adicionar dependentes.')
        return
      }
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

  function handleSaveHouse(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingHouse) return
    const form = event.currentTarget
    setError(null)
    const formData = new FormData(form)

    startTransition(async () => {
      const result = await updateHouse(editingHouse.id, {
        name: String(formData.get('houseName') ?? ''),
        imageUrl: String(formData.get('image_url') ?? '') || null,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setEditingHouse(null)
      setHouseImageUrl(null)
      router.refresh()
    })
  }

  function handleSaveDependent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingDependent) return
    const form = event.currentTarget
    setDepError(null)
    const formData = new FormData(form)

    startTransition(async () => {
      const result = await updateDependentProfile(editingDependent.profileId, {
        fullName: String(formData.get('dependentName') ?? ''),
        username: String(formData.get('dependentUsername') ?? ''),
        avatarUrl: String(formData.get('avatar_url') ?? '') || null,
      })
      if (!result.ok) {
        setDepError(result.error)
        return
      }
      setEditingDependent(null)
      setDependentAvatarUrl(null)
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
              Crie uma casa própria (gera um PIN de acesso) ou entre numa casa
              existente usando o PIN de outro administrador.
            </CardDescription>
          </div>
          <CardAction>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setError(null)
                setShowHouseForm((value) => !value)
              }}
            >
              {showHouseForm ? 'Fechar' : 'Nova casa'}
            </Button>
          </CardAction>
        </CardHeader>
        {showHouseForm ? (
          <CardContent>
            <div className="mb-3 flex gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setError(null)
                  setHouseMode('create')
                }}
                className={cn(
                  'min-h-9 rounded-xl px-3 text-sm font-medium outline-none transition-colors',
                  houseMode === 'create'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                )}
              >
                Criar casa
              </button>
              <button
                type="button"
                onClick={() => {
                  setError(null)
                  setHouseMode('join')
                }}
                className={cn(
                  'min-h-9 rounded-xl px-3 text-sm font-medium outline-none transition-colors',
                  houseMode === 'join'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                )}
              >
                Entrar com PIN
              </button>
            </div>

            {houseMode === 'create' ? (
              <form
                key="create"
                onSubmit={handleCreate}
                className="flex flex-col gap-3"
              >
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
            ) : (
              <form
                key="join"
                onSubmit={handleJoin}
                className="flex flex-col gap-3"
              >
                <div className="grid gap-2">
                  <Label htmlFor="house-pin">PIN da casa</Label>
                  <Input
                    id="house-pin"
                    name="pin"
                    type="text"
                    placeholder="Ex.: ABC123"
                    autoComplete="off"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Você passa a controlar essa casa junto com o administrador
                    que a criou.
                  </p>
                </div>

                {error ? (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                ) : null}

                <Button type="submit" disabled={pending}>
                  {pending ? 'Entrando...' : 'Entrar na casa'}
                </Button>
              </form>
            )}
          </CardContent>
        ) : null}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Suas casas</CardTitle>
          <CardDescription>
            Clique para alternar a casa ativa · lápis para editar.
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
                  <div
                    key={house.id}
                    className={cn(
                      'flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-3 py-2 shadow-sm transition-colors',
                      active && 'border-blue-600 bg-sky-50'
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelect(house.id)}
                      disabled={pending || active}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      {house.image_url ? (
                        <img
                          src={house.image_url}
                          alt=""
                          className="size-10 shrink-0 rounded-lg border border-slate-200 object-cover"
                        />
                      ) : (
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-lg font-bold text-sky-700">
                          {house.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-medium text-slate-800">
                          {house.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {active ? 'Casa ativa' : 'Alternar'} · PIN{' '}
                          {house.code}
                        </span>
                      </span>
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="min-h-9 shrink-0 px-2 text-xs text-slate-500"
                      onClick={() => copyPin(house.code)}
                      title="Copiar PIN"
                    >
                      <Copy className="size-3.5" />
                      PIN
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="min-h-9 shrink-0 px-2 text-xs text-slate-500"
                      onClick={() => {
                        setError(null)
                        setHouseImageUrl(house.image_url)
                        setEditingHouse(house)
                      }}
                    >
                      <Pencil className="size-3.5" />
                      Editar
                    </Button>
                  </div>
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
          <CardTitle className="flex items-center gap-3">
            {activeHouseImageUrl ? (
              <img
                src={activeHouseImageUrl}
                alt=""
                className="size-9 rounded-lg border border-slate-200 object-cover"
              />
            ) : null}
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
                  className="flex items-center justify-between gap-3 rounded-lg border border-input px-3 py-2 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    {member.avatarUrl ? (
                      <img
                        src={member.avatarUrl}
                        alt=""
                        className="size-9 shrink-0 rounded-full border border-slate-200 object-cover"
                      />
                    ) : (
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sky-100 font-semibold text-sky-700">
                        {member.fullName.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className="truncate font-medium">{member.fullName}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span
                      data-role={member.role.toLowerCase()}
                      className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500 data-[role=admin]:bg-sky-100 data-[role=admin]:text-sky-700"
                    >
                      {member.role === 'ADMIN' ? 'Administrador' : 'Dependente'}
                    </span>
                    {member.role === 'DEPENDENT' ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="min-h-9 px-2 text-xs text-slate-500"
                        onClick={() => {
                          setDepError(null)
                          setDependentAvatarUrl(member.avatarUrl)
                          setEditingDependent(member)
                        }}
                      >
                        <Pencil className="size-3.5" />
                        Editar
                      </Button>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Modal
        open={!!editingHouse}
        onClose={() => {
          setEditingHouse(null)
          setHouseImageUrl(null)
        }}
        title={`Editar casa — ${editingHouse?.name ?? ''}`}
      >
        {editingHouse ? (
          <form onSubmit={handleSaveHouse} className="flex flex-col gap-3">
            <div className="grid gap-2">
              <Label htmlFor="edit-house-name">Nome da casa</Label>
              <Input
                id="edit-house-name"
                name="houseName"
                type="text"
                defaultValue={editingHouse.name}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Imagem</Label>
              <ImageUpload
                folder="houses"
                ownerId={editingHouse.id}
                value={houseImageUrl}
                onChange={setHouseImageUrl}
              />
              <input type="hidden" name="image_url" value={houseImageUrl ?? ''} />
            </div>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={pending}>
              {pending ? 'Salvando...' : 'Salvar alterações'}
            </Button>
          </form>
        ) : null}
      </Modal>

      <Modal
        open={!!editingDependent}
        onClose={() => {
          setEditingDependent(null)
          setDependentAvatarUrl(null)
        }}
        title={`Editar — ${editingDependent?.fullName ?? ''}`}
      >
        {editingDependent ? (
          <form onSubmit={handleSaveDependent} className="flex flex-col gap-3">
            <div className="grid gap-2">
              <Label htmlFor="edit-dependent-name">Nome completo</Label>
              <Input
                id="edit-dependent-name"
                name="dependentName"
                type="text"
                defaultValue={editingDependent.fullName}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-dependent-username">Nome de usuário</Label>
              <Input
                id="edit-dependent-username"
                name="dependentUsername"
                type="text"
                autoComplete="off"
                defaultValue={editingDependent.username ?? ''}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Avatar</Label>
              <ImageUpload
                folder="avatars"
                ownerId={editingDependent.profileId}
                value={dependentAvatarUrl}
                onChange={setDependentAvatarUrl}
              />
              <input type="hidden" name="avatar_url" value={dependentAvatarUrl ?? ''} />
            </div>
            {depError ? (
              <p className="text-sm text-destructive" role="alert">
                {depError}
              </p>
            ) : null}
            <Button type="submit" disabled={pending}>
              {pending ? 'Salvando...' : 'Salvar alterações'}
            </Button>
          </form>
        ) : null}
      </Modal>
    </div>
  )
}
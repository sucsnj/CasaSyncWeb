'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  createDependent,
  createHouse,
  deleteHouse,
  expelMember,
  joinHouseByPin,
  rotateHousePin,
  selectHouse,
  updateDependentPoints,
  updateDependentProfile,
  updateHouse,
  updateMemberPassword,
} from '@/actions/houses'
import { ImageUpload } from '@/components/ui/image-upload'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Coins,
  Copy,
  Key,
  Pencil,
  RefreshCw,
  Trash2,
  UserMinus,
} from 'lucide-react'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type House = {
  id: string
  name: string
  image_url: string | null
  code: string
  owner_id: string
}
type Member = {
  profileId: string
  fullName: string
  username: string | null
  avatarUrl: string | null
  points: number
  role: 'ADMIN' | 'DEPENDENT'
}

type HousesManagerProps = {
  houses: House[]
  activeHouseId: string | null
  activeHouseName: string | null
  activeHouseImageUrl: string | null
  activeHouseOwnerId: string | null
  currentUserId: string
  members: Member[]
}

type ConfirmAction =
  | { kind: 'expel'; member: Member }
  | { kind: 'deleteHouse'; house: House }

export function HousesManager({
  houses,
  activeHouseId,
  activeHouseName,
  activeHouseImageUrl,
  activeHouseOwnerId,
  currentUserId,
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

  const [passwordMember, setPasswordMember] = useState<Member | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null)
  const [passwordPending, setPasswordPending] = useState(false)

  const [pointsMember, setPointsMember] = useState<Member | null>(null)
  const [pointsNewValue, setPointsNewValue] = useState<number>(0)
  const [pointsError, setPointsError] = useState<string | null>(null)
  const [pointsSuccess, setPointsSuccess] = useState<string | null>(null)
  const [pointsPending, setPointsPending] = useState(false)

  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [actionPending, setActionPending] = useState(false)

  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    startTransition(async () => {
      const result = await createHouse(houseName)
      if (!result.ok) {
        setError(result.error)
        toast.error(result.error)
        return
      }
      toast.success('Casa criada!')
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
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'Casa vinculada!')
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
        toast.error(result.error)
        return
      }

      toast.success('Dependente criado!')
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
      if (!result.ok) {
        setError(result.error)
        toast.error(result.error)
      } else {
        toast.success('Casa ativa alterada!')
      }
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
        toast.error(result.error)
        return
      }
      toast.success('Casa atualizada!')
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
        toast.error(result.error)
        return
      }
      toast.success('Dependente atualizado!')
      setEditingDependent(null)
      setDependentAvatarUrl(null)
      router.refresh()
    })
  }

  async function handleSavePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!passwordMember) return

    const form = event.currentTarget
    setPasswordError(null)
    setPasswordSuccess(null)
    setPasswordPending(true)

    try {
      // Senha lida do FormData no submit e descartada — nunca vai para o
      // estado do React (ver ADR-0003).
      const result = await updateMemberPassword(
        passwordMember.profileId,
        String(new FormData(form).get('newPassword') ?? '')
      )

      if (!result.ok) {
        setPasswordError(result.error)
        toast.error(result.error)
        return
      }

      toast.success('Senha redefinida!')
      form.reset()
      setPasswordSuccess(result.message ?? 'Senha atualizada.')
    } finally {
      setPasswordPending(false)
    }
  }

  async function handleSavePoints(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!pointsMember) return

    const form = event.currentTarget
    setPointsError(null)
    setPointsSuccess(null)
    setPointsPending(true)

    try {
      // Valores lidos do FormData no submit — o PIN da casa nunca vai para o
      // estado do React (ver ADR-0003).
      const formData = new FormData(form)
      const result = await updateDependentPoints(
        pointsMember.profileId,
        Number(String(formData.get('newPoints') ?? '')),
        String(formData.get('pinPts') ?? ''),
        String(formData.get('reason') ?? '')
      )

      if (!result.ok) {
        setPointsError(result.error)
        toast.error(result.error)
        return
      }

      toast.success('Pontos atualizados!')
      form.reset()
      setPointsSuccess(result.message ?? 'Pontos atualizados.')
      router.refresh()
    } finally {
      setPointsPending(false)
    }
  }

  function handleRotatePin(house: House) {
    startTransition(async () => {
      const result = await rotateHousePin(house.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'PIN atualizado!')
      router.refresh()
    })
  }

  async function handleConfirmAction() {
    if (!confirmAction) return
    setConfirmError(null)
    setActionPending(true)

    try {
      const result =
        confirmAction.kind === 'expel'
          ? await expelMember(
              activeHouseId ?? '',
              confirmAction.member.profileId
            )
          : await deleteHouse(confirmAction.house.id)

      if (!result.ok) {
        setConfirmError(result.error)
        toast.error(result.error)
        return
      }

      toast.success(result.message ?? 'Concluído!')
      setConfirmAction(null)
      if (confirmAction.kind === 'deleteHouse') {
        setEditingHouse(null)
        setHouseImageUrl(null)
      }
      router.refresh()
    } finally {
      setActionPending(false)
    }
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
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate font-medium text-slate-800">
                            {house.name}
                          </span>
                          {house.owner_id === currentUserId ? (
                            <span
                              title="Autor da casa"
                              className="flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[11px] font-bold text-amber-700"
                            >
                              A
                            </span>
                          ) : null}
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
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg border border-input px-3 py-2 text-sm"
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
                    <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate font-medium">{member.fullName}</span>
                        {member.profileId === activeHouseOwnerId ? (
                          <span
                            title="Autor da casa"
                            className="flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[11px] font-bold text-amber-700"
                          >
                            A
                          </span>
                        ) : null}
                      </span>
                  </span>
                  <span className="flex flex-wrap items-center justify-end gap-2">
                    <span
                      data-role={member.role.toLowerCase()}
                      className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500 data-[role=admin]:bg-sky-100 data-[role=admin]:text-sky-700"
                    >
                      {member.role === 'ADMIN' ? 'Administrador' : 'Dependente'}
                    </span>
                    {member.role === 'DEPENDENT' ? (
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                        {member.points} pts
                      </span>
                    ) : null}
                    {member.profileId === currentUserId ||
                    currentUserId === activeHouseOwnerId ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="min-h-9 px-2 text-xs text-slate-500"
                        onClick={() => {
                          setPasswordError(null)
                          setPasswordSuccess(null)
                          setPasswordMember(member)
                        }}
                        title={
                          member.profileId === currentUserId
                            ? 'Alterar a própria senha'
                            : 'Redefinir a senha deste membro'
                        }
                      >
                        <Key className="size-3.5" />
                        Senha
                      </Button>
                    ) : null}
                    {member.role === 'DEPENDENT' ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="min-h-9 px-2 text-xs text-slate-500"
                        onClick={() => {
                          setPointsError(null)
                          setPointsSuccess(null)
                          setPointsNewValue(member.points)
                          setPointsMember(member)
                        }}
                      >
                        <Coins className="size-3.5" />
                        Pontos
                      </Button>
                    ) : null}
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
                    {activeHouseOwnerId === currentUserId &&
                    member.profileId !== activeHouseOwnerId ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="min-h-9 px-2 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                        onClick={() => {
                          setConfirmError(null)
                          setConfirmAction({ kind: 'expel', member })
                        }}
                        title="Expulsar da casa (remove os dados ativos)"
                      >
                        <UserMinus className="size-3.5" />
                        Expulsar
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
          <>
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
            {editingHouse.owner_id === currentUserId ? (
              <div className="mt-4 flex flex-col gap-2 border-t border-slate-200 pt-4">
                <span className="text-xs font-medium text-muted-foreground">
                  Ações do autor
                </span>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 justify-start"
                  disabled={pending}
                  onClick={() => handleRotatePin(editingHouse)}
                >
                  <RefreshCw className="size-4" />
                  Alterar PIN da casa
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 justify-start text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={() => {
                    setConfirmError(null)
                    setConfirmAction({ kind: 'deleteHouse', house: editingHouse })
                  }}
                >
                  <Trash2 className="size-4" />
                  Excluir casa
                </Button>
              </div>
            ) : null}
          </>
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

      <Modal
        open={!!passwordMember}
        onClose={() => {
          setPasswordMember(null)
          setPasswordError(null)
          setPasswordSuccess(null)
        }}
        title={`Redefinir senha — ${passwordMember?.fullName ?? ''}`}
      >
        {passwordMember ? (
          <form
            key={passwordMember.profileId}
            onSubmit={handleSavePassword}
            className="flex flex-col gap-3"
          >
            <p className="text-sm text-muted-foreground">
              Defina uma nova senha para{' '}
              <strong>{passwordMember.fullName}</strong>
              {passwordMember.username
                ? ` (@${passwordMember.username})`
                : ''}
              . Ela passa a valer no próximo login.
            </p>

            <div className="grid gap-2">
              <Label htmlFor="member-new-password">Nova senha / PIN</Label>
              <Input
                id="member-new-password"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                placeholder="Mínimo de 6 caracteres"
                suppressHydrationWarning
                required
                minLength={6}
              />
            </div>

            {passwordError ? (
              <p className="text-sm text-destructive" role="alert">
                {passwordError}
              </p>
            ) : null}
            {passwordSuccess ? (
              <p className="text-sm font-medium text-emerald-600" role="status">
                {passwordSuccess}
              </p>
            ) : null}

            <Button type="submit" disabled={passwordPending}>
              {passwordPending ? 'Salvando...' : 'Salvar Nova Senha'}
            </Button>
          </form>
        ) : null}
      </Modal>

      <Modal
        open={!!pointsMember}
        onClose={() => {
          setPointsMember(null)
          setPointsError(null)
          setPointsSuccess(null)
        }}
        title={`Alterar pontos — ${pointsMember?.fullName ?? ''}`}
      >
        {pointsMember ? (
          <form
            key={pointsMember.profileId}
            onSubmit={handleSavePoints}
            className="flex flex-col gap-3"
          >
            <p className="text-sm text-muted-foreground">
              Saldo atual de <strong>{pointsMember.fullName}</strong>
              {pointsMember.username ? ` (@${pointsMember.username})` : ''}:{' '}
              <strong>{pointsMember.points} pts</strong>. Defina o novo total
              acumulado (pode ser negativo).
            </p>

            <div className="grid gap-2">
              <Label htmlFor="member-new-points">Novo total de pontos</Label>
              <Input
                id="member-new-points"
                name="newPoints"
                type="number"
                inputMode="numeric"
                value={pointsNewValue}
                onChange={(event) => setPointsNewValue(Number(event.target.value))}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="member-reason">Descrição do ajuste</Label>
              <Input
                id="member-reason"
                name="reason"
                type="text"
                autoComplete="off"
                placeholder="Informe a descrição do ajuste"
                disabled={pointsNewValue >= pointsMember.points}
                required={pointsNewValue < pointsMember.points}
                suppressHydrationWarning
              />
              <p className="text-xs text-muted-foreground">
                Obrigatório apenas quando o novo total for menor que o saldo
                atual (penalização).
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="member-pin-pts">PIN da casa</Label>
              <Input
                id="member-pin-pts"
                name="pinPts"
                type="password"
                autoComplete="off"
                placeholder="Informe o PIN da casa"
                suppressHydrationWarning
                required
              />
              <p className="text-xs text-muted-foreground">
                Confirme a alteração com o PIN da casa (o mesmo código exibido em
                &quot;Suas casas&quot;).
              </p>
            </div>

            {pointsError ? (
              <p className="text-sm text-destructive" role="alert">
                {pointsError}
              </p>
            ) : null}
            {pointsSuccess ? (
              <p className="text-sm font-medium text-emerald-600" role="status">
                {pointsSuccess}
              </p>
            ) : null}

            <Button type="submit" disabled={pointsPending}>
              {pointsPending ? 'Salvando...' : 'Salvar pontos'}
            </Button>
          </form>
        ) : null}
      </Modal>

      <Modal
        open={!!confirmAction}
        onClose={() => {
          if (actionPending) return
          setConfirmAction(null)
          setConfirmError(null)
        }}
        title={
          confirmAction?.kind === 'deleteHouse'
            ? 'Excluir casa'
            : `Expulsar — ${confirmAction?.member?.fullName ?? ''}`
        }
      >
        {confirmAction ? (
          <div className="flex flex-col gap-3">
            {confirmAction.kind === 'deleteHouse' ? (
              <p className="text-sm text-muted-foreground">
                Excluir <strong>{confirmAction.house.name}</strong> remove a
                casa e todos os dados dela (tarefas, recompensas, resgates,
                sugestões, notificações e configurações). Só é possível quando
                você é o único membro restante. Esta ação não pode ser
                desfeita.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Remover <strong>{confirmAction.member.fullName}</strong> da casa
                faz com que tarefas pendentes/ativas, resgates pendentes e
                sugestões sejam apagados. Tarefas concluídas/aprovadas, resgates
                resolvidos e os pontos do perfil ficam como histórico.
              </p>
            )}

            {confirmError ? (
              <p className="text-sm text-destructive" role="alert">
                {confirmError}
              </p>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                disabled={actionPending}
                onClick={() => {
                  setConfirmAction(null)
                  setConfirmError(null)
                }}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="flex-1"
                disabled={actionPending}
                onClick={() => void handleConfirmAction()}
              >
                {actionPending
                  ? confirmAction.kind === 'deleteHouse'
                    ? 'Excluindo...'
                    : 'Expulsando...'
                  : confirmAction.kind === 'deleteHouse'
                    ? 'Excluir casa'
                    : 'Expulsar'}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateOwnProfile } from '@/actions/auth'
import { ImageUpload } from '@/components/ui/image-upload'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export function ProfileEditor({
  userId,
  fullName,
  avatarUrl,
}: {
  userId: string
  fullName: string | null
  avatarUrl: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [avatar, setAvatar] = useState<string | null>(avatarUrl)

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    setError(null)
    const formData = new FormData(form)

    startTransition(async () => {
      const result = await updateOwnProfile({
        fullName: String(formData.get('fullName') ?? ''),
        avatarUrl: String(formData.get('avatar_url') ?? '') || null,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Seu perfil</CardTitle>
        <CardDescription>
          Como o seu avatar e nome aparecem para os dependentes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="grid gap-2">
            <Label>Avatar</Label>
            <ImageUpload
              folder="avatars"
              ownerId={userId}
              value={avatar}
              onChange={setAvatar}
              label="Enviar foto"
            />
            <input type="hidden" name="avatar_url" value={avatar ?? ''} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="profile-full-name">Nome completo</Label>
            <Input
              id="profile-full-name"
              name="fullName"
              type="text"
              defaultValue={fullName ?? ''}
              required
            />
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending ? 'Salvando...' : 'Salvar perfil'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
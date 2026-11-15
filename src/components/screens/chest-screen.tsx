'use client'

import { useAppSession } from '@/components/session/app-session'
import { NoHouseCard } from '@/components/session/no-house-card'
import { ChestAdmin } from '@/components/chest/chest-admin'
import { ChestDependent } from '@/components/chest/chest-dependent'

/** Shell cliente de `/chest` (inclui o cabeçalho role-aware da página). */
export function ChestScreen() {
  const { role, houseId, houseName } = useAppSession()
  const isAdmin = role === 'ADMIN'

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-800">
          Baú
        </h1>
        <p className="text-sm text-slate-500">
          {isAdmin
            ? 'Arquivos que você disponibiliza para os dependentes.'
            : 'Arquivos que seu tutor deixou para você consultar.'}
        </p>
      </header>
      {houseId ? (
        isAdmin ? (
          <ChestAdmin houseId={houseId} houseName={houseName ?? ''} />
        ) : (
          <ChestDependent houseId={houseId} />
        )
      ) : (
        <NoHouseCard role={role} />
      )}
    </>
  )
}

'use client'

import { createContext, useContext, type ReactNode } from 'react'

export type AppSession = {
  userId: string
  role: 'ADMIN' | 'DEPENDENT'
  houseId: string | null
  houseName: string | null
}

const AppSessionContext = createContext<AppSession | null>(null)

/**
 * Sessão instantânea para as rotas do grupo `(app)`: montada uma única vez
 * pelo shell (`(app)/layout.tsx`), que já leu a sessão e a casa ativa no
 * servidor. As telas leem `houseId`/`role`/`userId` daqui — sem round-trip
 * adicional para montar o `useQuery`.
 */
export function AppSessionProvider({
  session,
  children,
}: {
  session: AppSession
  children: ReactNode
}) {
  return (
    <AppSessionContext.Provider value={session}>
      {children}
    </AppSessionContext.Provider>
  )
}

export function useAppSession(): AppSession {
  const ctx = useContext(AppSessionContext)
  if (!ctx) {
    throw new Error('useAppSession só pode ser usado dentro do shell (app).')
  }
  return ctx
}

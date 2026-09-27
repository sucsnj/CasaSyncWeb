'use client'

import { useEffect, useSyncExternalStore } from 'react'

/**
 * "Há alguma conquista para resgatar?" — estado compartilhado dentro da aba.
 *
 * Por que um store e não só a prop do servidor: o badge dourado do item
 * "Conquistas" precisa mudar **no mesmo instante** em que o dependente resgata
 * (o `router.refresh()` chegaria depois), e o `AchievementsDependent` — que é
 * quem publica, por ter a lista completa de conquistas + `is_repeatable` — não é
 * ancestral do `DashboardNav` (são irmãos renderizados pela page). Um store de
 * módulo resolve os dois lados sem mudar a composição das páginas.
 *
 * `null` = "nada publicado ainda" → vale o valor que o servidor mandou na prop.
 */

type Listener = () => void

let current: boolean | null = null
const listeners = new Set<Listener>()

function subscribe(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): boolean | null {
  return current
}

function getServerSnapshot(): boolean | null {
  return null
}

/** Publica o valor vivo (a lista de conquistas do dependente mudou nesta aba). */
export function setClaimableAchievements(value: boolean) {
  if (current === value) return
  current = value
  for (const listener of listeners) listener()
}

/**
 * `serverValue` é o cálculo do servidor (render da page) e serve de semente: um
 * valor novo vindo de lá é mais recente que o store e realinha os dois.
 */
export function useClaimableAchievement(serverValue?: boolean): boolean {
  const live = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  useEffect(() => {
    if (serverValue !== undefined) setClaimableAchievements(serverValue)
  }, [serverValue])

  return live ?? serverValue ?? false
}

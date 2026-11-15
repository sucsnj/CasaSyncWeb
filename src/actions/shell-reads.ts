'use server'

import {
  getActiveAdminHouse,
  getAdminHouses,
  getDependentHouse,
  getHouseTutors,
  getSessionProfile,
  type Tutor,
} from '@/utils/house'
import { getHouseQuickMessageSettings } from '@/utils/house-settings'
import { getMyNotifications } from '@/utils/notifications'
import { getActivePunishment } from '@/utils/active-punishment'
import { hasClaimableAchievement } from '@/utils/achievement-progress'
import { getDueComunicados } from '@/actions/comunicados'
import type { NotificationRow } from '@/types/notifications'
import type { DueComunicado } from '@/utils/comunicados'
import type { QuickMessageSettings } from '@/utils/settings'
import type { ActivePunishment } from '@/utils/punishments'

export type ShellBundle = {
  userId: string
  role: 'ADMIN' | 'DEPENDENT'
  profile: {
    id: string
    full_name: string | null
    avatar_url: string | null
    points: number
  }
  houseId: string | null
  houseName: string | null
  /** Casas controladas pelo ADMIN (seletor de casa no sino). */
  adminHouses: { id: string; name: string }[]
  houseNames: Record<string, string>
  notifications: NotificationRow[]
  quickMessageSettings?: QuickMessageSettings
  punishment: ActivePunishment | null
  dueComunicados: DueComunicado[]
  hasClaimableAchievement?: boolean
  /** DEPENDENT: tutores da casa (para a visão geral). */
  tutors?: Tutor[]
}

/**
 * Shell do grupo `(app)` montado client-side após hidratação: tudo que o
 * layout precisa para renderizar (nav, sino, overlay de alertas, badge de
 * conquistas, castigo, comunicados) em **uma** chamada, com escopo derivado
 * da sessão. Espelha o `(app)/layout.tsx` anterior (mesmo conjunto de
 * leituras), para que nenhuma regra mude no caminho.
 */
export async function getShellBundle(): Promise<ShellBundle> {
  const { user, profile } = await getSessionProfile()
  if (!user || !profile) throw new Error('UNAUTHENTICATED')

  const isAdmin = profile.user_role === 'ADMIN'

  const [notifications, activeHouse, dependentHouse, adminHouses, hasClaimable] =
    await Promise.all([
      getMyNotifications(user.id),
      isAdmin ? getActiveAdminHouse() : Promise.resolve(null),
      isAdmin ? Promise.resolve(null) : getDependentHouse(user.id),
      isAdmin ? getAdminHouses(user.id) : Promise.resolve([]),
      // Item "Conquistas" da nav dourado quando há resgate disponível (só p/
      // o dependente).
      isAdmin ? Promise.resolve(false) : hasClaimableAchievement(user.id),
    ])

  const houseId = isAdmin
    ? (activeHouse?.id ?? null)
    : (dependentHouse?.id ?? null)
  const houseName = isAdmin
    ? (activeHouse?.name ?? null)
    : (dependentHouse?.name ?? null)

  const houseNames = Object.fromEntries(
    adminHouses.map((house) => [house.id, house.name])
  )

  const quickMessageSettings =
    !isAdmin && dependentHouse
      ? await getHouseQuickMessageSettings(dependentHouse.id)
      : undefined

  const punishment =
    !isAdmin && dependentHouse
      ? await getActivePunishment(user.id, dependentHouse.id)
      : null

  const dueComunicados =
    !isAdmin && dependentHouse ? await getDueComunicados() : []

  const tutors =
    !isAdmin && dependentHouse ? await getHouseTutors(dependentHouse.id) : undefined

  return {
    userId: user.id,
    role: isAdmin ? 'ADMIN' : 'DEPENDENT',
    profile: {
      id: profile.id,
      full_name: profile.full_name,
      avatar_url: profile.avatar_url,
      points: profile.points,
    },
    houseId,
    houseName,
    adminHouses,
    houseNames,
    notifications,
    quickMessageSettings,
    punishment,
    dueComunicados,
    hasClaimableAchievement: isAdmin ? undefined : hasClaimable,
    tutors,
  }
}

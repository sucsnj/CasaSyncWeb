import { Preferences } from '@capacitor/preferences'
import type { RecentAccount } from '@/utils/biometric-vault'

const KEY = 'casasync:recent-accounts'

export async function getRecentAccounts(): Promise<RecentAccount[]> {
  try {
    const { value } = await Preferences.get({ key: KEY })
    if (!value) return []
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function saveRecentAccount(account: RecentAccount): Promise<void> {
  const list = await getRecentAccounts()
  const filtered = list.filter((a) => a.userId !== account.userId)
  const next = [account, ...filtered].slice(0, 5)
  await Preferences.set({ key: KEY, value: JSON.stringify(next) })
}

export async function removeRecentAccount(userId: string): Promise<void> {
  const list = await getRecentAccounts()
  const next = list.filter((a) => a.userId !== userId)
  await Preferences.set({ key: KEY, value: JSON.stringify(next) })
}

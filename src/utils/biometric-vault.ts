import { Capacitor } from '@capacitor/core'
import { NativeBiometric } from '@capgo/capacitor-native-biometric'

export type RecentAccount = {
  userId: string
  loginIdentifier: string
  displayName: string | null
  avatarUrl: string | null
  role: 'ADMIN' | 'DEPENDENT'
  biometricEnabled: boolean
}

export type VaultResult = { ok: true } | { ok: false; reason: string }

type NativeModule = {
  isAvailable?: () => Promise<{ isAvailable?: boolean; biometryType?: number }>
  setCredentials?: (opts: {
    username: string
    password: string
    server: string
  }) => Promise<void>
  verifyIdentity?: (opts: { reason: string; title: string }) => Promise<void>
  getCredentials?: (opts: { server: string }) => Promise<{ username?: string; password?: string }>
  deleteCredentials?: (opts: { server: string; username?: string }) => Promise<void>
}

type TokenMap = Record<string, string>

// O plugin usa chaves internas fixas no Android e ignora `server` para isolar
// registros. Por isso guardamos todas as contas num único JSON.
const VAULT_SERVER = 'casasync:vault'
const VAULT_USERNAME = 'casasync-vault'

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function readVaultMap(native: NativeModule): Promise<TokenMap> {
  if (!native.getCredentials) return {}
  try {
    const creds = await native.getCredentials({ server: VAULT_SERVER })
    if (!creds?.password) return {}
    const parsed = JSON.parse(creds.password)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as TokenMap
    }
    return {}
  } catch {
    return {}
  }
}

async function writeVaultMap(native: NativeModule, map: TokenMap): Promise<void> {
  if (!native.setCredentials) throw new Error('plugin setCredentials indisponível')
  await native.setCredentials({
    server: VAULT_SERVER,
    username: VAULT_USERNAME,
    password: JSON.stringify(map),
  })
}

export type BiometricVault = {
  isAvailable: () => Promise<VaultResult>
  saveToken: (userId: string, refreshToken: string) => Promise<VaultResult>
  verifyAndGetToken: (userId: string) => Promise<string | null>
  deleteToken: (userId: string) => Promise<void>
}

export const biometricVault: BiometricVault = {
  async isAvailable() {
    if (!Capacitor.isNativePlatform()) return { ok: false, reason: 'plataforma não nativa' }
    const native = NativeBiometric as unknown as NativeModule
    if (!native.isAvailable) return { ok: false, reason: 'plugin isAvailable indisponível' }
    try {
      const result = await native.isAvailable()
      if (result?.isAvailable === true) return { ok: true }
      return {
        ok: false,
        reason: `isAvailable=false (biometryType=${result?.biometryType ?? 'n/a'})`,
      }
    } catch (err) {
      return { ok: false, reason: errorMessage(err) }
    }
  },
  async saveToken(userId, refreshToken) {
    if (!Capacitor.isNativePlatform()) return { ok: false, reason: 'plataforma não nativa' }
    const native = NativeBiometric as unknown as NativeModule
    if (!native.setCredentials) return { ok: false, reason: 'plugin setCredentials indisponível' }
    try {
      const current = await readVaultMap(native)
      const updated = { ...current, [userId]: refreshToken }
      await writeVaultMap(native, updated)
      return { ok: true }
    } catch (err) {
      return { ok: false, reason: errorMessage(err) }
    }
  },
  async verifyAndGetToken(userId) {
    if (!Capacitor.isNativePlatform()) return null
    const native = NativeBiometric as unknown as NativeModule
    if (!native.verifyIdentity || !native.getCredentials) return null
    try {
      await native.verifyIdentity({
        reason: 'Confirme sua identidade para entrar',
        title: 'Login CasaSync',
      })
      const map = await readVaultMap(native)
      return map[userId] ?? null
    } catch {
      // Cancelamento, lockout ou credencial ausente: retorna null sem quebrar a UI.
      return null
    }
  },
  async deleteToken(userId) {
    if (!Capacitor.isNativePlatform()) return
    const native = NativeBiometric as unknown as NativeModule
    if (!native.getCredentials || !native.setCredentials || !native.deleteCredentials) return
    try {
      const map = await readVaultMap(native)
      if (!(userId in map)) return
      delete map[userId]
      if (Object.keys(map).length > 0) {
        await writeVaultMap(native, map)
      } else {
        await native.deleteCredentials({ server: VAULT_SERVER })
      }
    } catch {
      // Sem credencial salva ou usuário cancelou: nunca lançar.
    }
  },
}

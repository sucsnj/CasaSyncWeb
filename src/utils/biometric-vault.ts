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
  getSecureCredentials?: (opts: { server: string }) => Promise<{ username?: string; password?: string }>
  deleteCredentials?: (opts: { server: string; username?: string }) => Promise<void>
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
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
      await native.setCredentials({
        username: userId,
        password: refreshToken,
        server: `casasync:${userId}`,
      })
      return { ok: true }
    } catch (err) {
      return { ok: false, reason: errorMessage(err) }
    }
  },
  async verifyAndGetToken(userId) {
    if (!Capacitor.isNativePlatform()) return null
    const native = NativeBiometric as unknown as NativeModule
    if (!native.verifyIdentity || !native.getSecureCredentials) return null
    try {
      await native.verifyIdentity({
        reason: 'Confirme sua identidade para entrar',
        title: 'Login CasaSync',
      })
      const creds = await native.getSecureCredentials({ server: `casasync:${userId}` })
      if (creds?.username === userId && creds?.password) {
        return creds.password
      }
      return null
    } catch {
      // Cancelamento, lockout ou credencial ausente: retorna null sem quebrar a UI.
      return null
    }
  },
  async deleteToken(userId) {
    if (!Capacitor.isNativePlatform()) return
    const native = NativeBiometric as unknown as NativeModule
    if (!native.deleteCredentials) return
    try {
      await native.deleteCredentials({ server: `casasync:${userId}`, username: userId })
    } catch {
      // Sem credencial salva ou usuário cancelou: nunca lançar.
    }
  },
}

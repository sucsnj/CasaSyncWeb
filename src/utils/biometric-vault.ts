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

async function loadNative(): Promise<NativeModule | null> {
  if (!Capacitor.isNativePlatform()) return null
  return NativeBiometric as unknown as NativeModule
}

export type BiometricVault = {
  isAvailable: () => Promise<boolean>
  saveToken: (userId: string, refreshToken: string) => Promise<void>
  verifyAndGetToken: (userId: string) => Promise<string | null>
  deleteToken: (userId: string) => Promise<void>
}

export const biometricVault: BiometricVault = {
  async isAvailable() {
    const native = await loadNative()
    if (!native?.isAvailable) return false
    try {
      const result = await native.isAvailable()
      return result?.isAvailable === true
    } catch {
      return false
    }
  },
  async saveToken(userId, refreshToken) {
    const native = await loadNative()
    if (!native?.setCredentials) return
    await native.setCredentials({
      username: userId,
      password: refreshToken,
      server: `casasync:${userId}`,
    })
  },
  async verifyAndGetToken(userId) {
    const native = await loadNative()
    if (!native?.verifyIdentity || !native?.getSecureCredentials) return null
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
    } catch (err) {
      // Cancelamento ou lockout: retorna null sem quebrar a UI.
      const message = (err as { message?: string })?.message ?? ''
      if (
        message.includes('USER_LOCKOUT') ||
        message.includes('USER_TEMPORARY_LOCKOUT') ||
        message.includes('canceled') ||
        message.includes('cancelled')
      ) {
        return null
      }
      return null
    }
  },
  async deleteToken(userId) {
    const native = await loadNative()
    if (!native?.deleteCredentials) return
    try {
      await native.deleteCredentials({ server: `casasync:${userId}`, username: userId })
    } catch {
      // ignore
    }
  },
}

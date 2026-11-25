import { Capacitor } from '@capacitor/core'

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
    accessControl?: string
  }) => Promise<void>
  getSecureCredentials?: (opts: { server: string }) => Promise<{ username?: string; password?: string }>
  deleteCredentials?: (opts: { server: string; username?: string }) => Promise<void>
}

async function loadNative(): Promise<NativeModule | null> {
  if (!Capacitor.isNativePlatform()) return null
  try {
    const mod = await import('@capgo/capacitor-native-biometric')
    return (mod as { NativeBiometric?: NativeModule }).NativeBiometric ??
      (mod as { default?: NativeModule }).default ??
      null
  } catch {
    return null
  }
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
      return Boolean(result?.isAvailable)
    } catch {
      return false
    }
  },
  async saveToken(userId, refreshToken) {
    const native = await loadNative()
    if (!native?.setCredentials) return
    try {
      await native.setCredentials({
        username: userId,
        password: refreshToken,
        server: `casasync:${userId}`,
        accessControl: 'biometryAny',
      })
    } catch {
      // Falha silenciosa: a biometria é opcional.
    }
  },
  async verifyAndGetToken(userId) {
    const native = await loadNative()
    if (!native?.getSecureCredentials) return null
    try {
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

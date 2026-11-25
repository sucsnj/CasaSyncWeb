/**
 * Adaptador do cofre biométrico.
 *
 * Hoje (camada web/shared) só a interface fica pronta: no navegador a
 * biometria não está disponível e todos os métodos falham de forma segura.
 * A próxima etapa conecta `@capgo/capacitor-native-biometric` aqui dentro,
 * sem tocar no restante do app.
 */
export type RecentAccount = {
  userId: string
  loginIdentifier: string
  displayName: string | null
  avatarUrl: string | null
  role: 'ADMIN' | 'DEPENDENT'
  biometricEnabled: boolean
}

export type BiometricVault = {
  isAvailable: () => Promise<boolean>
  saveToken: (userId: string, refreshToken: string) => Promise<void>
  verifyAndGetToken: (userId: string) => Promise<string | null>
  deleteToken: (userId: string) => Promise<void>
}

type NativeBiometricModule = {
  isAvailable?: () => Promise<{ isAvailable?: boolean }>
  setCredentials?: (opts: { username: string; password: string; server: string }) => Promise<void>
  verifyIdentity?: (opts: { reason: string; title: string }) => Promise<void>
  getCredentials?: (opts: { server: string }) => Promise<{ username?: string; password?: string }>
  deleteCredentials?: (opts: { server: string; username: string }) => Promise<void>
}

async function loadNativeBiometric(): Promise<NativeBiometricModule | null> {
  try {
    // @ts-expect-error - módulo opcional, instalado apenas na build nativa
    const mod = await import('@capgo/capacitor-native-biometric')
    const resolved =
      (mod as { NativeBiometric?: NativeBiometricModule }).NativeBiometric ??
      (mod as { default?: NativeBiometricModule }).default ??
      null
    return resolved as NativeBiometricModule | null
  } catch {
    return null
  }
}

export const biometricVault: BiometricVault = {
  async isAvailable() {
    const native = await loadNativeBiometric()
    if (!native?.isAvailable) return false
    try {
      const result = await native.isAvailable()
      return Boolean(result?.isAvailable)
    } catch {
      return false
    }
  },
  async saveToken(userId, refreshToken) {
    const native = await loadNativeBiometric()
    if (!native?.setCredentials) return
    try {
      await native.setCredentials({
        username: userId,
        password: refreshToken,
        server: 'casasync',
      })
    } catch {
      // Falha silenciosa: a biometria é opcional.
    }
  },
  async verifyAndGetToken(userId) {
    const native = await loadNativeBiometric()
    if (!native?.verifyIdentity || !native?.getCredentials) return null
    try {
      await native.verifyIdentity({
        reason: 'Confirme sua identidade para entrar',
        title: 'Desbloqueio biométrico',
      })
      const creds = await native.getCredentials({ server: 'casasync' })
      if (creds?.username === userId) return creds.password ?? null
      return null
    } catch {
      return null
    }
  },
  async deleteToken(userId) {
    const native = await loadNativeBiometric()
    if (!native?.deleteCredentials) return
    try {
      await native.deleteCredentials({ server: 'casasync', username: userId })
    } catch {
      // ignore
    }
  },
}

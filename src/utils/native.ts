import { Capacitor } from '@capacitor/core'

/**
 * `true` somente quando a página está rodando dentro do APK (WebView do
 * Capacitor). No navegador/PWA continua `false`, então os recursos web seguem
 * exatamente como antes.
 */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform()
}

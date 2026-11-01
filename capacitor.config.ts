import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Empacotamento Android via Capacitor.
 *
 * O CasaSync é um app Next.js com RSC, Server Actions e sessão por cookie —
 * nada disso roda dentro de um WebView sem servidor. Por isso o APK é um
 * **wrapper remoto**: carrega o site publicado e usa o shell nativo apenas para
 * status bar, splash, botão voltar e abertura de links externos.
 *
 * A URL pode ser trocada sem mexer no código:
 *   CAPACITOR_SERVER_URL=https://outro-dominio.com npm run cap:sync
 */
const serverUrl =
  process.env.CAPACITOR_SERVER_URL ?? 'https://casa-sync-web.vercel.app'

const config: CapacitorConfig = {
  appId: 'br.com.casasync.app',
  appName: 'CasaSync',
  webDir: 'capacitor/www',
  server: {
    url: serverUrl,
    cleartext: false,
    // Exibida quando o WebView não consegue alcançar o servidor (offline/queda).
    errorPath: 'offline.html',
  },
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: process.env.CAPACITOR_DEBUG === 'true',
    backgroundColor: '#1d4ed8',
  },
  plugins: {
    // SystemBars é o plugin de barras do Capacitor 8 (substitui o StatusBar no
    // edge-to-edge do Android 15+). `native` deixa o WebView respeitar o
    // `viewport-fit=cover` do Next e expõe `env(safe-area-inset-*)` no CSS.
    SystemBars: {
      insetsHandling: 'native',
      initialViewportFitValueHint: 'cover',
      style: 'DARK',
      hidden: false,
    },
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: '#1d4ed8',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
  },
}

export default config

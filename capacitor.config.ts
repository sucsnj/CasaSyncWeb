import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.casasync.app',
  appName: 'CasaSync',
  webDir: 'out',
  server: {
    url: 'https://casa-sync-web.vercel.app/',
    cleartext: false,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
}

export default config
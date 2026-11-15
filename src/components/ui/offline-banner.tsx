'use client'

import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'

/**
 * Aviso de dispositivo offline: enquanto não houver rede, as telas renderizam
 * o cache persistido (IndexedDB) — aviso fixo no rodapé. Assim que a conexão
 * voltar, o React Query dispara `refetchOnReconnect` sozinho e o banner some.
 *
 * No WebView do Capacitor (Android/iOS) `navigator.onLine` pode responder `false`
 * mesmo com rede disponível — bug conhecido do WebView. Por isso, no nativo o
 * banner é controlado por `@capacitor/network` (`getStatus` + `networkStatusChange`);
 * no navegador comum, apenas pelos eventos `online`/`offline` (que não disparam falsos positivos).
 */
export function OfflineBanner() {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    let mounted = true

    if (Capacitor.isNativePlatform()) {
      let removeListener: (() => Promise<void>) | undefined
      void import('@capacitor/network').then(({ Network }) => {
        if (!mounted) return
        Network.getStatus().then((status) => {
          if (mounted) setOnline(status.connected)
        })
        Network.addListener('networkStatusChange', (status) => {
          setOnline(status.connected)
        }).then((handle) => {
          removeListener = () => handle.remove()
        })
      })
      return () => {
        mounted = false
        void removeListener?.()
      }
    }

    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  if (online) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-center gap-2 bg-amber-400 px-4 py-2 text-center text-sm font-semibold text-amber-950 shadow-md"
    >
      Você está offline — mostrando o que está salvo no aparelho.
    </div>
  )
}

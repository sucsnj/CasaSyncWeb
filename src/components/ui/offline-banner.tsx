'use client'

import { useEffect, useState } from 'react'

/**
 * Aviso de dispositivo offline: enquanto não houver rede, as telas renderizam
 * o cache persistido (IndexedDB) — aviso fixo no rodapé. Assim que a conexão
 * voltar, o React Query dispara `refetchOnReconnect` sozinho e o banner some.
 */
export function OfflineBanner() {
  const [online, setOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
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

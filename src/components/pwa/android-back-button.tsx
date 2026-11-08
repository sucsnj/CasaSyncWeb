'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { Capacitor } from '@capacitor/core'

export function AndroidBackButton() {
  const pathname = usePathname()
  const pathnameRef = useRef(pathname)

  // Atualiza a ref para que o listener do Capacitor consulte sempre a rota atualizada sem recriar o event listener
  useEffect(() => {
    pathnameRef.current = pathname
  }, [pathname])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    let removeListener: (() => void) | undefined

    const setupListener = async () => {
      try {
        const { App } = await import('@capacitor/app')

        const handle = await App.addListener('backButton', () => {
          // Normaliza o pathname removendo barras no final
          const currentPath = (pathnameRef.current || window.location.pathname).replace(/\/$/, '') || '/'

          const defaultRoutes = [
            '/',
            '/dashboard/admin',
            '/dashboard/dependent',
            '/login'
          ]

          const isDefaultRoute = defaultRoutes.includes(currentPath)

          console.log('[BACK] path=', currentPath, 'isDefaultRoute=', isDefaultRoute)

          if (isDefaultRoute) {
            void App.exitApp()
          } else {
            window.history.back()
          }
        })

        removeListener = () => {
          void handle.remove()
        }
      } catch (err) {
        console.error('[BACK] Erro ao registrar listener do botão voltar:', err)
      }
    }

    void setupListener()

    return () => {
      removeListener?.()
    }
  }, [])

  return null
}
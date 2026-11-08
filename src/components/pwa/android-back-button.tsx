'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Capacitor } from '@capacitor/core'

export function AndroidBackButton() {
  const pathname = usePathname()
  const router = useRouter()
  const pathnameRef = useRef(pathname)

  // Mantém a referência da rota atual sempre atualizada
  useEffect(() => {
    pathnameRef.current = pathname
  }, [pathname])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    let removeListener: (() => void) | undefined

    const setupListener = async () => {
      try {
        const { App } = await import('@capacitor/app')

        // Prioridade no listener para garantir interrupção do evento nativo
        const handle = await App.addListener('backButton', () => {
          // Normaliza o pathname
          const currentPath = (pathnameRef.current || window.location.pathname)
            .replace(/\/$/, '') || '/'

          const defaultRoutes = [
            '',
            '/',
            '/dashboard/admin',
            '/dashboard/dependent',
            '/login'
          ]

          const isDefaultRoute = defaultRoutes.includes(currentPath)

          console.log('[BACK] path=', currentPath, 'isDefaultRoute=', isDefaultRoute)

          if (isDefaultRoute) {
            // Encerra a aplicação nas rotas principais
            void App.exitApp()
          } else {
            // Usa a navegação do próprio Next.js em vez do window.history.back()
            router.back()
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
  }, [router])

  return null
}
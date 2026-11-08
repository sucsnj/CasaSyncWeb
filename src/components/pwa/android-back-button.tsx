'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Capacitor } from '@capacitor/core'

export function AndroidBackButton() {
  const pathname = usePathname()
  const router = useRouter()
  const pathnameRef = useRef(pathname)

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
          // 1. Pega a rota atual (via Next.js pathname ou fallback para window.location)
          const rawPath = pathnameRef.current || window.location.pathname

          // 2. Remove query params (?redirectedFrom=...) e a barra final se houver
          const currentPath = rawPath
            .split('?')[0]
            .replace(/\/$/, '') || '/'

          // 3. Define as rotas exatas e prefixos onde o app deve FECHAR
          const exactRoutes = ['', '/', '/dashboard/admin', '/dashboard/dependent']
          const prefixRoutes = ['/login']

          const isDefaultRoute =
            exactRoutes.includes(currentPath) ||
            prefixRoutes.some(
              (prefix) => currentPath === prefix || currentPath.startsWith(`${prefix}/`)
            )

          console.log('[BACK] path=', currentPath, 'isDefaultRoute=', isDefaultRoute)

          if (isDefaultRoute) {
            void App.exitApp()
          } else {
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
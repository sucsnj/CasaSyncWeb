'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core'
import { App } from '@capacitor/app'
import { SplashScreen } from '@capacitor/splash-screen'

/** Telas com topo claro: ícones escuros na status bar. */
const LIGHT_TOP_ROUTES = new Set(['/login', '/register', '/abrir-anexo'])

/**
 * Ajustes que só fazem sentido dentro do APK (Capacitor).
 *
 * No navegador é um no-op — todo o bloco é guardado por `isNativePlatform()`.
 * Como o APK carrega o site publicado, este componente roda no deploy normal;
 * ele não existe "dentro do APK" separado da web.
 *
 * - **Barras do sistema:** ícones claros sobre o cabeçalho azul e escuros nas
 *   telas de topo claro (login/cadastro/aviso de anexo).
 * - **Splash:** esconde assim que o app monta (o auto-hide é só uma rede).
 * - **Botão voltar:** usa o histórico do WebView; na raiz minimiza o app em vez
 *   de travar (o Capacitor, sem listener, consome o toque e não faz nada).
 *
 * Links externos já são abertos no navegador pelo próprio Capacitor
 * (`Bridge.launchIntent`): mesma origem fica no WebView (rotas de anexo
 * autenticadas), outra origem sai para o navegador do sistema.
 */
export function NativeShell() {
  const pathname = usePathname()

  // Reaplica ao navegar entre telas: login (topo claro) x app (topo azul).
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    const hasDarkTop = !LIGHT_TOP_ROUTES.has(pathname)
    void SystemBars.setStyle({
      style: hasDarkTop ? SystemBarsStyle.Dark : SystemBarsStyle.Light,
    }).catch((error) => {
      console.warn('SystemBars não configurada:', error)
    })
  }, [pathname])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    let disposed = false
    let removeBackListener: (() => Promise<void>) | null = null

    async function setup() {
      try {
        const listener = await App.addListener('backButton', ({ canGoBack }) => {
          // Modal aberto trava o scroll do `body`; o voltar fecha o modal
          // (mesmo caminho do Esc) em vez de navegar para trás.
          if (document.body.style.overflow === 'hidden') {
            document.dispatchEvent(
              new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
            )
            return
          }

          if (canGoBack) {
            window.history.back()
          } else {
            void App.minimizeApp()
          }
        })
        if (disposed) {
          void listener.remove()
        } else {
          removeBackListener = () => listener.remove()
        }
      } catch (error) {
        console.warn('Botão voltar não registrado:', error)
      }

      try {
        await SplashScreen.hide()
      } catch (error) {
        console.warn('Splash screen não escondida:', error)
      }
    }

    void setup()

    return () => {
      disposed = true
      if (removeBackListener) void removeBackListener()
    }
  }, [])

  return null
}

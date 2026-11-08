import { Capacitor } from '@capacitor/core'

/**
 * Abre um anexo em nova aba/janela.
 *
 * No Android (Capacitor) usamos o Browser in-app, que traz botão de fechar e
 * evita a tela "sem retorno" do WebView. Na web/PWA mantemos `window.open`.
 */
export async function openAttachment(url: string) {
  if (Capacitor.isNativePlatform()) {
    const { Browser } = await import('@capacitor/browser')
    await Browser.open({ url, presentationStyle: 'popover' })
    return
  }

  window.open(url, '_blank', 'noopener,noreferrer')
}
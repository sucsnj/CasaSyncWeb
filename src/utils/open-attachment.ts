import { Capacitor } from '@capacitor/core'

/**
 * Abre um anexo em nova aba/janela.
 *
 * No Android (Capacitor) usamos o Browser in-app, que traz botão de fechar e
 * evita a tela "sem retorno" do WebView. Na web/PWA mantemos `window.open`.
 */
export async function openAttachment(url: string) {
  const resolved =
    url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')
      ? url
      : `${window.location.origin}${url.startsWith('/') ? url : `/${url}`}`

  if (Capacitor.isNativePlatform()) {
    const { Browser } = await import('@capacitor/browser')
    await Browser.open({ url: resolved })
    return
  }

  window.open(resolved, '_blank', 'noopener,noreferrer')
}
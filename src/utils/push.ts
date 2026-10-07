// Client-side Web Push utilities
export function getVapidPublicKey(): string {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) {
    throw new Error('VAPID public key not configured (NEXT_PUBLIC_VAPID_PUBLIC_KEY)');
  }
  return key;
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * A subscription fica **ligada** à `applicationServerKey` com que foi criada. Se
 * a chave VAPID for rotacionada depois, o servidor passa a assinar com a privada
 * nova e o FCM responde **403 para sempre** para aquele aparelho.
 *
 * Sem esta comparação, o `return existing` devolvia a subscription velha sem
 * nunca olhar a chave — então a rotação prendia o dispositivo num 403
 * permanente (e a linha continuava no banco, errando a cada envio).
 *
 * Quando o navegador não expõe `options.applicationServerKey`, devolvemos `true`
 * (mantém o comportamento antigo): sem informação para comparar, trocar de
 * assinatura a cada abertura seria pior.
 */
function subscriptionMatchesCurrentKey(
  subscription: PushSubscription,
  currentKey: Uint8Array
): boolean {
  const existing = subscription.options?.applicationServerKey
  if (!existing) return true

  const view = new Uint8Array(existing)
  if (view.length !== currentKey.length) return false
  for (let i = 0; i < view.length; i += 1) {
    if (view[i] !== currentKey[i]) return false
  }
  return true
}

export async function subscribeToPush(registration: ServiceWorkerRegistration): Promise<PushSubscription | null> {
  if (!('pushManager' in registration)) {
    console.warn('PushManager not supported');
    return null;
  }

  try {
    const existing = await registration.pushManager.getSubscription();

    // Chave lida aqui (e não no topo) para que uma subscription já existente
    // continue funcionando mesmo com a env var ausente — é o comportamento de
    // antes, e só o caminho de recriar precisa da chave.
    let currentKey: Uint8Array | null = null;
    try {
      currentKey = urlBase64ToUint8Array(getVapidPublicKey());
    } catch {
      currentKey = null;
    }

    if (existing) {
      if (!currentKey || subscriptionMatchesCurrentKey(existing, currentKey)) {
        return existing;
      }
      // Chave rotacionada: a subscription antiga é inválida para o servidor
      // (403 eterno). Remove e refaz com a chave atual — aí o aparelho se
      // conserta sozinho na próxima abertura do app.
      console.log('[push] Chave VAPID mudou: refazendo a subscription');
      await existing.unsubscribe();
    }

    if (!currentKey) return null;

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: currentKey as BufferSource,
    });

    return subscription;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotAllowedError') {
      console.log('Push permission denied');
    } else {
      console.error('Push subscription error:', err);
    }
    return null;
  }
}

export async function unsubscribeFromPush(registration: ServiceWorkerRegistration): Promise<boolean> {
  try {
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await subscription.unsubscribe();
      return true;
    }
    return false;
  } catch (err) {
    console.error('Push unsubscribe error:', err);
    return false;
  }
}

export function subscriptionToJSON(subscription: PushSubscription) {
  return {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')!))),
      auth: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('auth')!))),
    },
  };
}
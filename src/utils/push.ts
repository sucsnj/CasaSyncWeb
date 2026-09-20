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

export async function subscribeToPush(registration: ServiceWorkerRegistration): Promise<PushSubscription | null> {
  if (!('pushManager' in registration)) {
    console.warn('PushManager not supported');
    return null;
  }

  try {
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      return existing;
    }

    const vapidPublicKey = getVapidPublicKey();
    const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey as BufferSource,
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
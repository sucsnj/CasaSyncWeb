// CasaSync Service Worker - Offline support + Web Push notifications
const CACHE_NAME = 'casasync-v2';
// Somente assets estáticos de verdade. A página raiz "/" NÃO entra aqui:
// é 100% dinâmica (force-dynamic) e o proxy decide o redirect por sessão/role.
const STATIC_ASSETS = [
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/apple-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and non-same-origin requests
  if (request.method !== 'GET' || url.origin !== location.origin) {
    return;
  }

  // Navegação de página NUNCA vem do cache-first: o app é dinâmico e o proxy
  // do servidor decide o redirect por sessão/role. Servir HTML em cache
  // impedia o redirect e prendia o usuário na página inicial.
  if (request.mode === 'navigate' || request.destination === 'document') {
    return;
  }

  // Skip Supabase API calls and auth endpoints
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseToCache);
        });

        return response;
      });
    })
  );
});

// Web Push: receber notificações do servidor
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const { title, body, icon, badge, tag, data: payload, actions } = data;

    const options = {
      body: body ?? '',
      icon: icon ?? '/icons/icon-192.png',
      badge: badge ?? '/icons/icon-192.png',
      tag: tag ?? 'casasync-notification',
      data: payload ?? {},
      actions: actions ?? [],
      requireInteraction: true,
      renotify: true,
    };

    event.waitUntil(
      self.registration.showNotification(title ?? 'CasaSync', options)
    );
  } catch (err) {
    console.error('Push event error:', err);
  }
});

// Web Push: clique na notificação abre/foca o app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const urlToOpen = event.notification.data?.url ?? '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Verifica se já tem uma janela aberta do app
      for (const client of windowClients) {
        if (client.url.includes(location.origin) && 'focus' in client) {
          client.postMessage({ type: 'NOTIFICATION_CLICK', url: urlToOpen });
          return client.focus();
        }
      }
      // Abre nova janela se não tiver nenhuma
      return clients.openWindow(urlToOpen);
    })
  );
});

// Web Push: erro de push subscription
self.addEventListener('pushsubscriptionchange', (event) => {
  console.log('Push subscription changed:', event);
  // O cliente vai re-subscrever automaticamente na próxima visita
});
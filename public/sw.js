// CasaSync Service Worker - Offline support + Web Push notifications
// v4: o `notificationclick` passou a trocar a casa ativa antes de navegar (o
// `link` é relativo e abria a tela da casa errada). Bump para forçar reinstalação
// nos browsers com a versão antiga em uso.
const CACHE_NAME = 'casasync-v4';
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

  // Cache-first SOMENTE para assets estáveis e imutáveis:
  //   - STATIC_ASSETS (manifest + ícones do PWA)
  //   - chunks de build do Next.js sob /_next/static/ (JS/CSS nomedos por hash)
  // Qualquer outro GET same-origin NÃO é cacheado: inclui os payloads RSC das
  // páginas (router.refresh()/prefetch buscam '/tasks' etc. com header RSC:1).
  // Cachear isso gravava respostas 200 obsoletas e o SW as devolvia depois do
  // F5 (que vai à rede), fazendo a UI "piscar" de volta para a info antiga e
  // demorar para fixar mudanças já no banco. Fora dos assets acima, sempre rede.
  const isStaticAsset = STATIC_ASSETS.includes(url.pathname);
  const isNextStaticChunk = url.pathname.startsWith('/_next/static/');
  if (!isStaticAsset && !isNextStaticChunk) {
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
  // Sem payload: ainda assim exibe uma notificação (não engolir em silêncio).
  if (!event.data) {
    return event.waitUntil(
      self.registration.showNotification('CasaSync', {
        body: 'Nova notificação recebida.',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: 'casasync-notification',
        data: {},
      })
    );
  }

  let data;
  try {
    data = event.data.json();
  } catch {
    // Payload não-JSON (ex.: push de teste do DevTools, que envia texto cru):
    // usa o texto como corpo em vez de abortar a exibição.
    data = { body: event.data.text() };
  }

  const { title, body, icon, badge, tag, data: payload, actions } = data;

  const options = {
    body: typeof body === 'string' ? body : '',
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
});

// Web Push: clique na notificação abre/foca o app.
//
// A notificação carrega a `houseId` de origem (`toPushPayload` espalha o
// `NotifyInput` em `data`). Como o `link` é RELATIVO e a página resolve pela casa
// ativa, abrir `/tasks` sem trocar a casa levava o ADMIN para a tela errada — o
// mesmo bug do sino. A troca acontece em UM dos dois caminhos:
//
//   - app ABERTO: a janela tem sessão e Server Action, então quem troca a casa é
//     o app (listener `NOTIFICATION_CLICK` no `DashboardNav`) — o SW só avisa;
//   - app FECHADO: não há janela nem Server Action, então o próprio SW grava o
//     cookie via POST same-origin **antes** de abrir a janela.
//
// Best-effort: se a gravação falhar (casa de que o ADMIN não participa mais,
// sessão expirada), a navegação acontece normalmente — sem a troca, não quebrada.
async function persistActiveHouse(houseId) {
  if (!houseId) return;
  try {
    await fetch('/api/active-house', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ houseId }),
    });
  } catch (error) {
    console.log('Falha ao gravar a casa ativa antes de abrir:', error);
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data ?? {};
  const urlToOpen = data.url ?? '/';
  const houseId = data.houseId ?? null;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // App aberto: a janela troca a casa e navega. O `url` é relativo à casa
      // ativa, então quem resolve o destino é o app, não o SW.
      for (const client of windowClients) {
        if (client.url.includes(location.origin) && 'focus' in client) {
          client.postMessage({
            type: 'NOTIFICATION_CLICK',
            url: urlToOpen,
            houseId,
          });
          return client.focus();
        }
      }
      // App fechado: grava a casa no cookie antes de abrir a janela.
      return persistActiveHouse(houseId).then(() => clients.openWindow(urlToOpen));
    })
  );
});

// Web Push: erro de push subscription
self.addEventListener('pushsubscriptionchange', (event) => {
  console.log('Push subscription changed:', event);
  // O cliente vai re-subscrever automaticamente na próxima visita
});
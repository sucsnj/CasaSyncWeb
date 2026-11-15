# Arquitetura e Supabase — CasaSync Web

## Fluxo de Requisição & Render
- **Proxy (`src/proxy.ts`):** Substitui middleware no Next 16 (chama `updateSession` em `middleware.ts`). Trata redirecionamentos por papel (`user_role`).
- **Optimization:** A role é consultada no DB **apenas** quando um redirecionamento for necessário (evita round-trip desnecessário em RSC/prefetch/POSTs).
- **Páginas do grupo `(app)` são shells leves:** `page.tsx` de `/tasks`, `/rewards`, `/achievements` e `/chest` não faz mais `await` de dados; renderiza um screen client (`src/components/screens/*`). O shell `(app)/layout.tsx` monta `AppSessionProvider` (`src/components/session/app-session.tsx`) com `{ userId, role, houseId, houseName }` lidos uma única vez na sessão — as telas montam o `useQuery` na hora, sem round-trip extra de RSC. As rotas renderizam a partir do cache (IndexedDB); `PageSkeleton` só na 1ª visita (`isPending && !data`) e `QueryError` com retry em falha. Os `loading.tsx` desses segmentos foram removidos.
- **Bundles = unidade de invalidação:** as actions `list*(houseId)` (`src/actions/*-reads.ts`) retornam o bundle completo (ex.: tasks + chestItems + settings de prazo/decaimento/anexos), validado por `assertHouseAccess` (`src/utils/tenant-scope.ts`) — escopo sempre derivado da sessão.
- **Server Components (RSC):** Buscam dados via `src/utils/house.ts` + `createClient()`.
- **Server Actions (`src/actions/*.ts`):** Todas as escritas (`'use server'`) retornam `ActionResult` (`{ ok, error?, data? }`). `revalidatePath` fica **só para rotas RSC** (`/dashboard/*` e `/abrir-anexo`); as rotas do grupo `(app)` são shells estáticos no cliente e seu dado é invalidado no client (`invalidateQueries`/`setQueryData`). `HOUSE_CONTEXT_ROUTES` (`src/actions/houses.ts`) contém apenas as rotas RSC de contexto.
- **Offline:** `src/components/ui/offline-banner.tsx` aviso fixo no rodapé; offline prolongado é servido pelo cache persistido (stale `~60s`, refetch no foco/reconexão via `refetchOnWindowFocus`/`refetchOnReconnect`).
- **Modais (`src/components/ui/modal.tsx`):** Portal no `body` (`z-[100]`), trava scroll, prende foco e fecha no Esc.

## Supabase & Clientes
- **Clientes (`src/utils/supabase/`):**
  - `server.ts`: Para RSC / Server Actions.
  - `client.ts`: Para Client Components no browser.
  - `admin.ts`: Service Role (`createAdminClient`). **Server-only**, nunca importar em Client Component.
- **Autorização:** Derivada **sempre** da sessão. `createAdminClient` usado apenas para escritas fora do RLS (criação de users, ajuste de pontos) ou leituras cross-role com escopo estrito da sessão.
- **Autenticação:** E-mails sintéticos (`${username}@admin.casasync` / `${username}@dependente.casasync`). Dependente nunca se cadastra sozinho.
- **Controle de Casa:** Baseado em membresia (`house_members.role = 'ADMIN'`), não em `owner_id`.

## Realtime & Fuso Horário
- **Realtime:** Hook `use-postgres-changes.ts` (o antigo `use-profile-points.ts` foi removido). Exige `getSession()` + `realtime.setAuth(access_token)` **antes** de assinar (evita falha silenciosa de RLS). Desde a Fase 2, o Realtime **invalida as chaves do query cache** (`@tanstack/react-query` + IndexedDB via `idb-keyval`, persistência em `src/lib/query/persist.ts`, chaves namespaced em `src/lib/query/keys.ts`) ou patcha o cache direto — o `router.refresh()` só permanece em casos pontuais (ex.: dashboard RSC).
- **Datas & Fuso:** Prazos aceitam apenas strings ISO com fuso (`normalizeDueDate`). O cliente usa `datetimeLocalToIso`. Exibição sempre via `FormattedDateTime` para evitar hydration mismatch entre SSR e browser.

## Capacitor & Push Nativo
- **Empacotamento:** Capacitor aponta para a URL remota da Vercel (`server.url` em `capacitor.config.ts`); `webDir` é `out/` (placeholder).
- **Push híbrido:** `usePushNotifications` detecta `Capacitor.isNativePlatform()`:
  - Nativo: FCM via `@capacitor/push-notifications`, token salvo em `push_subscriptions` com `provider = 'FCM_NATIVE'`.
  - Web: Web Push (VAPID) existente.
- **Backend:** `push-service.ts` bifurca o envio por `provider`: Web Push (VAPID) e FCM (Firebase Admin HTTP v1).
- **Android:** permissões `INTERNET`, `POST_NOTIFICATIONS`, `VIBRATE`, `WAKE_LOCK`; `google-services.json` em `android/app/`; ícone de notificação `ic_stat_ic_notification` (vector drawable).
# Arquitetura e Supabase — CasaSync Web

## Fluxo de Requisição & Render
- **Proxy (`src/proxy.ts`):** Substitui middleware no Next 16 (chama `updateSession` em `middleware.ts`). Trata redirecionamentos por papel (`user_role`).
- **Optimization:** A role é consultada no DB **apenas** quando um redirecionamento for necessário (evita round-trip desnecessário em RSC/prefetch/POSTs).
- **Server Components (RSC):** Buscam dados via `src/utils/house.ts` + `createClient()`.
- **Server Actions (`src/actions/*.ts`):** Todas as escritas (`'use server'`) retornam `ActionResult` (`{ ok, error?, data? }`).
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
- **Realtime:** Hooks `use-postgres-changes.ts` e `use-profile-points.ts`. Exigem `getSession()` + `realtime.setAuth(access_token)` **antes** de assinar (evita falha silenciosa de RLS).
- **Datas & Fuso:** Prazos aceitam apenas strings ISO com fuso (`normalizeDueDate`). O cliente usa `datetimeLocalToIso`. Exibição sempre via `FormattedDateTime` para evitar hydration mismatch entre SSR e browser.

## Anexos e Mídia
- Para detalhes sobre CSP, sandbox, brechas e mitigações de anexos, consulte docs/seguranca-anexos.md.

## Idempotência & Fila Offline
- **Helper:** `withIdempotency(operationId, kind, run)` em `src/lib/idempotency.ts` (server-only). Sem `operationId`, executa a ação original sem tocar no banco — o caminho online fica inalterado.
- **Primeira execução:** reserva `app_operations.operation_id`, executa a ação e grava o `ActionResult` em `result`. Replay devolve o mesmo resultado **sem** reexecutar pontos, notificações ou push.
- **Claim em andamento:** `result` nulo e claim recente (< 60s) devolve `code: 'IN_PROGRESS'`; claim órfão é retomado e, se a reexecução esbarrar num guard, devolve `code: 'CONFLICT'`.
- **Falhas:** não são memorizadas. A chave é liberada (DELETE) para nova tentativa — as ações só produzem efeito depois das validações, então reexecutar é seguro.
- **Escopo (Fase 0):** `completeTask`, `requestTaskExtension`, `approveTask`, `rejectCompletedTask`, `markTaskNotDelivered`, `setTaskOnHold`, `restoreTask`, `adminCompleteTask`, `resolveTaskExtension`, `requestRedemption`, `approveRedemption`, `rejectRedemption`, `createRewardSuggestion`, `resolveRewardSuggestion`. `updateDependentPoints` (SET absoluto) fica **online-only**.
- **Schema:** `docs/sql/app_operations.sql` (aplicado). Ações sem `operationId` são o caminho normal até a Fase 4 (UI) conectá-las.
- **Infra cliente (Fase 1):** `src/lib/offline/{types,db,queue,snapshot,actions,sync-dispatch}.ts`, `src/hooks/{use-online,use-pending-sync}.ts`, `src/components/offline/offline-provider.tsx`, rotas `/api/health` e `/api/sync`. IndexedDB `casasync-pwa` v1 (stores `snapshot`/`outbox`/`meta`), fila com `flushQueue` (batch 20, timeout 10s, lock `inFlight`, max 3 tentativas) e `submitOrQueue` (gera `operationId` antes da tentativa online). `clearOfflineData()` no logout. Proxy exclui `/api/health` do matcher e responde 401 JSON em `/api/*` sem sessão.

## Android (Capacitor)
- **Modelo:** wrapper remoto (ADR-0028). O APK carrega a URL publicada (`capacitor.config.ts` → `server.url`, default `https://casa-sync-web.vercel.app`) no WebView. RSC, Server Actions, rotas `/api/*` de anexo e sessão por cookie continuam no servidor — **não** há export estático.
- **Shell nativo (`src/components/native/native-shell.tsx`):** status bar via `SystemBars` do Capacitor 8 (`insetsHandling: native`, ícones claros no topo azul e escuros em login/cadastro/anexo), splash e botão voltar (histórico do WebView; na raiz minimiza o app). Fora do APK é no-op (`src/utils/native.ts`).
- **Safe areas:** `viewportFit: 'cover'` no `RootLayout` + `env(safe-area-inset-*)` no cabeçalho, nos três layouts de shell e na bottom nav.
- **Links:** mesma origem permanece no WebView (anexos HTML autenticados); outra origem abre no navegador do sistema (`Bridge.launchIntent`).
- **Permissões Android:** `INTERNET` e `CAMERA` (a câmera ao vivo da mensagem rápida usa `getUserMedia`; sem a permissão declarada o WebView nega). Uploads usam o file picker nativo do Capacitor.
- **Limitações:** Web Push e service worker ficam desligados dentro do APK (`isNativeApp()`); push nativo exigiria FCM + `@capacitor/push-notifications`. O conteúdo web é sempre o do deploy — não há bundle local para atualizar.
- **Build:** `npm run cap:sync` → `npm run cap:open` (Android Studio) ou `npm run cap:run`; APK release com `npm run android:apk`.
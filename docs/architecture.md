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

## Android (Capacitor)
- **Modelo:** wrapper remoto (ADR-0028). O APK carrega a URL publicada (`capacitor.config.ts` → `server.url`, default `https://casa-sync-web.vercel.app`) no WebView. RSC, Server Actions, rotas `/api/*` de anexo e sessão por cookie continuam no servidor — **não** há export estático.
- **Shell nativo (`src/components/native/native-shell.tsx`):** status bar via `SystemBars` do Capacitor 8 (`insetsHandling: native`, ícones claros no topo azul e escuros em login/cadastro/anexo), splash e botão voltar (histórico do WebView; na raiz minimiza o app). Fora do APK é no-op (`src/utils/native.ts`).
- **Safe areas:** `viewportFit: 'cover'` no `RootLayout` + `env(safe-area-inset-*)` no cabeçalho, nos três layouts de shell e na bottom nav.
- **Links:** mesma origem permanece no WebView (anexos HTML autenticados); outra origem abre no navegador do sistema (`Bridge.launchIntent`).
- **Permissões Android:** `INTERNET` e `CAMERA` (a câmera ao vivo da mensagem rápida usa `getUserMedia`; sem a permissão declarada o WebView nega). Uploads usam o file picker nativo do Capacitor.
- **Limitações:** Web Push e service worker ficam desligados dentro do APK (`isNativeApp()`); push nativo exigiria FCM + `@capacitor/push-notifications`. O conteúdo web é sempre o do deploy — não há bundle local para atualizar.
- **Build:** `npm run cap:sync` → `npm run cap:open` (Android Studio) ou `npm run cap:run`; APK release com `npm run android:apk`.
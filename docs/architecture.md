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

## Capacitor & Push Nativo
- **Empacotamento:** Capacitor aponta para a URL remota da Vercel (`server.url` em `capacitor.config.ts`); `webDir` é `out/` (placeholder).
- **Push híbrido:** `usePushNotifications` detecta `Capacitor.isNativePlatform()`:
  - Nativo: FCM via `@capacitor/push-notifications`, token salvo em `push_subscriptions` com `provider = 'FCM_NATIVE'`.
  - Web: Web Push (VAPID) existente.
- **Backend:** `push-service.ts` bifurca o envio por `provider`: Web Push (VAPID) e FCM (Firebase Admin HTTP v1).
- **Android:** permissões `INTERNET`, `POST_NOTIFICATIONS`, `VIBRATE`, `WAKE_LOCK`; `google-services.json` em `android/app/`; ícone de notificação `ic_stat_ic_notification` (vector drawable).

## Cache de Cliente (React Query) — "local-first"
- **Provider global:** `src/components/providers/query-provider.tsx` (no layout raiz) — `staleTime: 5min`, `gcTime: 30min`, `refetchOnWindowFocus: false` (só dado crítico, como saldo, marca `true`).
- **Chaves:** `src/lib/query-keys.ts` — o primeiro segmento é o **escopo da rota** (`tasks`, `rewards`, `achievements`, `chest`), o que permite invalidar a tela inteira com `invalidateQueries({ queryKey: [scope] })` (é o que o pull-to-refresh usa).
- **Leitura:** o `queryFn` é uma **Server Action por tela** (ex.: `fetchTasksForCache`) — service-role + escopo derivado da sessão (ADR-0006). **Nunca** leitura pelo cliente do browser: o RLS não entrega o que a tela mostra (dependente lê a própria tarefa, ADMIN lê a casa inteira).
- **Hidratação sem dupla busca:** o Server Component busca **uma vez**, passa o mesmo resultado como prop e o `dehydrate` no `HydrationBoundary` — o client já nasce com o dado (SWR) e **não** refaz a requisição no primeiro paint.
- **Escrita:** Realtime e mutações otimistas escrevem no **mesmo cache** (`setQueryData`) — uma verdade só, sem espelho em `useState`.
- **Shell continua no servidor:** badges da nav, ícone de castigo, comunicados e sino são RSC e se atualizam com `router.refresh()`.
- **Mutações (F3):** os componentes das rotas migradas nunca chamam `router.refresh()` — ações que alteram os dados da tela chamam `useInvalidateScope(scope)()` (`src/hooks/use-invalidate-scope.ts`), que invalida o prefixo da tela (`['tasks']` etc.) e o React Query re-sincroniza em background, sem reload. O saldo é reconciliado pelo `useProfilePoints` (Realtime + `refetchOnWindowFocus`) e o badge de conquistas resgatáveis pelo `useClaimableAchievement` (Realtime).
- **Pull-to-refresh (Android):** invalida o escopo da rota ativa + `router.refresh()` do shell — não limpa mais o cache da sessão.

**Rotas migradas (F1):** `/tasks`, `/rewards`, `/achievements`, `/chest` — cada uma com **uma** Server Action de leitura (`fetchTasksForCache`, `fetchRewardsForCache`, `fetchAchievementsForCache`, `fetchChestForCache`), `HydrationBoundary` no RSC (o mesmo array vira prop e estado do cache → zero requisição duplicada no primeiro paint) e as listas como verdade única no cache (Realtime e mutações otimistas escrevem nele via `setQueryData`).

- `useQueryList` (`src/hooks/use-query-list.ts`): lista única (baú, tarefas) — API `setData(prev => next)` compatível com o `useState` anterior.
- `useQueryScreen` (`src/hooks/use-query-screen.ts`): tela com várias listas que mudam juntas (catálogo + resgates + sugestões; conquistas + progresso) — **uma** chave → **uma** Server Action na revalidação (o Next enfileira actions concorrentes na mesma tela).
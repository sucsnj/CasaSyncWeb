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
---
description: Carrega arquitetura e modelo de dados completos do CasaSync para tarefas que exigem profundidade (opcional: foque em $ARGUMENTS).
---

# Contexto completo — CasaSync Web

Você recebeu o contexto integral do projeto abaixo (arquitetura, modelo de dados, regras, superfície de API). Use-o como base **sem reler toda a base de código**; consulte apenas o arquivo-fonte envolvido quando precisar de exatidão de uma linha específica.

$ARGUMENTS
- Se `$ARGUMENTS` citar uma área (ex: "tarefas", "auth", "recompensas"), aprofunde a resposta nessa área.
- Se `$ARGUMENTS` citar uma tabela/coluna, valide contra o modelo de dados abaixo.

---

## 1. Projeto

- Gamificação familiar multi-tenant: **ADMIN** cria casas e gerencia dependentes; tarefas geram pontos; recompensas gastam pontos.
- Stack: Next.js 16 (App Router em `src/`, proxy no lugar de middleware), React 19, Tailwind 4, shadcn/ui, lucide-react, Supabase (Auth/Postgres/Realtime/Storage).
- **Sem testes configurados.** Verificação antes de entregar: `npm run lint` → `npm run typecheck` → `npm run build`. `lint` emite warnings `no-img-element` **esperados** (uso deliberado de `<img>` para URLs públicas do Storage — não trocar por `next/image`).
- Documentos de referência: `AGENTS.md` (convenções), `PROJECT_STATUS.md` (changelog), `docs/schema.md`, `docs/adr/`.

## 2. Arquitetura e fluxo de requisição

1. **Proxy (substitui middleware, Next 16):** `src/proxy.ts` chama `updateSession` em `src/utils/supabase/middleware.ts`. Anônimo → `/login`; autenticado → dashboard da role; `/tasks` e `/rewards` são role-aware; `/` redireciona para `/login`.
2. **Pages server components** buscam dados via `src/utils/house.ts` (sessão/casa ativa) + `createClient` (RSC) e passam props tipadas aos client components.
3. **Escritas = Server Actions** (`src/actions/*.ts`, todos `'use server'`) retornando `ActionResult` (`{ ok, error?, data? }`). Formulários de credencial usam inputs **uncontrolled** (só `name`), lidos via `FormData(event.currentTarget)` no submit — NUNCA em `useState`.
4. **Realtime** sincroniza Admin ↔ Dependente via `src/hooks/use-postgres-changes.ts` (canal + `postgres_changes` + filter de `house_id`) e `src/hooks/use-profile-points.ts` (saldo ao vivo).

## 3. Supabase

- **3 clientes** em `src/utils/supabase/`:
  - `server.ts` `createClient()` — regras de Server Component/RSC.
  - `client.ts` `createClient()` — browser.
  - `admin.ts` `createAdminClient()` — **service role, server-only, nunca importar de client component**.
- **Env vars** (só `.env.local`, `.env*` gitignored): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (é *publishable*, não `ANON_KEY`), `SUPABASE_SERVICE_ROLE_KEY`, `MASTER_PIN` (valida cadastro ADMIN).
- **Auth:** sem e-mails reais — e-mails sintéticos `${username}@admin.casasync` (ADMIN) ou `${username}@dependente.casasync` (DEPENDENT), criados com `email_confirm: true` via service role. Login resolve username → e-mail sintético → `signInWithPassword` pelo servidor. DEPENDENT **nunca se cadastra sozinho**.
- **Padrão de autorização:** sempre derivada da sessão (cliente autenticado + RLS). O cliente service-role é usado **apenas** para escritas que o RLS não cobre (criação de usuários, crédito/débito de pontos, validação de posse `houses.owner_id`).
- **Transições de status com guard:** `update().eq('status', esperado)` impede crédito/débito duplicado (ex: `COMPLETED → APPROVED`); falha → rollback ao estado anterior.
- **Realtime:** tabelas devem estar na publication `supabase_realtime`.
- **Migrações SQL não versionadas:** pasta `supabase/` não existe (`supabase/*.sql` gitignored) — mudanças de schema são aplicadas manualmente no dashboard Supabase.

## 4. Rotas

| rota | papel |
|---|---|
| `/login`, `/register` | grupo `(auth)`; `/login` tem abas Entrar (username+senha) e Criar Conta Admin (com MASTER_PIN) |
| `/dashboard/admin` (+ layout) | visão geral ADMIN |
| `/dashboard/admin/houses` | gestão de casas/dependentes |
| `/dashboard/dependent` (+ layout) | visão geral DEPENDENT (inclui card "Seu tutor") |
| `/tasks` | role-aware (ADMIN aprova/gerencia; DEPENDENT vê as próprias) |
| `/rewards` | role-aware (ADMIN aprova resgates/sugestões; DEPENDENT catálogo + saldo) |
| `/auth/callback` | **sem uso** (Google OAuth removido) |

Nav (header fixo azul + bottom nav mobile) em `src/components/dashboard/dashboard-nav.tsx`, itens ativos por role: `/dashboard/admin`, `/dashboard/dependent`, `/dashboard/admin/houses`, `/tasks`, `/rewards`.

## 5. Modelo de dados (espelho de `src/types/database.ts`)

Enums (valores em **caixa alta**, regra de negócio):
- `user_role` / `member_role` = `ADMIN` | `DEPENDENT`
- `task_status` = `PENDING` | `IN_PROGRESS` | `COMPLETED` | `APPROVED`
- `redemption_status` = `PENDING` | `APPROVED` | `REJECTED`

**profiles** — `id` (uuid PK → auth.users), `username` (única lowercase), `full_name`, `avatar_url`, `user_role`, `points` (int, saldo), `created_at`, `updated_at`.

**houses** — `id`, `name`, `code` (código único de convite), `owner_id` (FK → profiles; posse validada via service role), `image_url`, `created_at`, `updated_at`.

**house_members** — `id`, `house_id` (FK → houses), `profile_id` (FK → profiles), `role` (`member_role`), `created_at`, `updated_at`.

**tasks** — `id`, `house_id` (FK; isolamento multi-tenant), `title`, `description`, `points`, `status` (`task_status`), `assigned_to` (FK → profiles, nullable), `created_by`, `completed_by`, `completed_at`, `due_date`, `image_url`, `extension_requested` (bool), `extension_reason`, `created_at`, `updated_at`. *(Edições só em PENDING/IN_PROGRESS; `''` normalizado para nul em `assigned_to`.)*

**rewards** — `id`, `house_id`, `title`, `description`, `points_cost`, `emoji`, `image_url`, `created_by`, `created_at`, `updated_at`.

**reward_redemptions** — `id`, `house_id`, `reward_id`, `profile_id`, `status` (`redemption_status`), `approved_by`, `points_cost` (snapshot do custo), `resolved_at`, `created_at`, `updated_at`.

**reward_suggestions** — `id`, `house_id`, `profile_id`, `title`, `description`, `points_cost` (nullable; `?? 5` ao aprovar), `image_url`, `status` (`PENDING` | `APPROVED` | `REJECTED`), `created_at`, `updated_at`.

**Fora do types (não verificável no código):** bucket público `casasync-media` (pastas avatars/houses/rewards/tasks/suggestions) + policies; RLS multi-tenant por `house_id`/owner; publication `supabase_realtime` com houses, house_members, profiles, tasks, rewards, reward_redemptions, reward_suggestions.

## 6. Regras de negócio

- Hierarquia: Admin → Casa(s) → Dependente(s) → Tarefas/Recompensas, isoladas por `house_id` (RLS) — multi-tenant. `ADMIN` cria/aprova tarefas, recompensas, resgates e dá crédito/débito de pontos.
- `approveTask`: `COMPLETED → APPROVED` **soma** `tasks.points` em `profiles.points`; depois de COMPLETED a tarefa é imutável para edição.
- `approveRedemption`: `PENDING → APPROVED` **debita** `points_cost` do saldo; `rejectRedemption`: `PENDING → REJECTED`.
- **SLA de prazo** (`src/utils/task-sla.ts`): `overdue` (agora > prazo; card `border-red-500/red-50/red-700`) e `dueSoon` (restante ≤ 20% do total; `border-amber-400/amber-50/amber-800`). Estilos em `src/components/tasks/task-styles.ts`.
- **Pedido de adiamento:** dependente define `extension_requested=true` + `extension_reason` (obrigatório, ≤ 500); ADMIN **aprova** (soma +3 dias sobre a data atual ou futura) ou **rejeita** (`resolveTaskExtension`); flags limpas nos dois casos.
- **Sugestões de recompensa:** dependente envia; ADMIN aprova → **cria a recompensa real** (transição guardada `PENDING→APPROVED` com rollback) ou rejeita.
- **Casa ativa do ADMIN** via cookie `casasync_active_house` (const `ACTIVE_HOUSE_COOKIE` em `src/utils/house.ts`).

## 7. Superfície de API

**actions/types.ts** — `ActionResult`, `USERNAME_PATTERN` (`/^[a-z0-9._-]{3,24}$/`), `validateUsername`, `validatePassword`.

**actions/auth.ts** — `registerAdmin(fullName, username, password, masterPin)`, `login(username, password)`, `updateOwnProfile({ fullName?, avatarUrl? })`.

**actions/houses.ts** — `createHouse(name)`, `selectHouse(houseId)`, `createDependent(fullName, username, password, houseId?)`, `updateHouse({ name?, imageUrl? })`, `updateDependentProfile(dependentId, { fullName?, username?, avatarUrl? })`.

**actions/tasks.ts** — `createTask({ title, description, dueDate, points, assignedTo, imageUrl })`, `updateTask(taskId, patch: TaskPatch)` (`TaskPatch`: title/description/due_date/points/assigned_to/image_url), `completeTask(taskId)`, `approveTask(taskId)`, `requestTaskExtension(taskId, reason)`, `resolveTaskExtension(taskId, approve: boolean)`.

**actions/rewards.ts** — `createReward({ title, description, pointsCost, emoji?, imageUrl? })`, `requestRedemption(rewardId)`, `approveRedemption(redemptionId)`, `rejectRedemption(redemptionId)`, `updateReward(rewardId, patch: RewardPatch)` (title/description/points_cost/emoji/image_url), `createRewardSuggestion({ title, description, pointsCost?, imageUrl? })`, `resolveRewardSuggestion(suggestionId, approve: boolean)`.

**utils/house.ts** — `getSessionProfile()` → `{ user, profile, houseName? }`, `getActiveAdminHouse()` (via cookie), `getDependentHouse(userId)`, `getHouseAssignees(houseId)`, `getHouseTutor(houseId)`, `withAdminClient<T>(fn)`, `ACTIVE_HOUSE_COOKIE`.

**utils/media.ts** — `MEDIA_BUCKET = 'casasync-media'`, `uploadMedia(folder: MediaFolder, file)` — `MediaFolder = 'avatars' | 'houses' | 'rewards' | 'tasks' | 'suggestions'`.

**utils/task-sla.ts** — `getTaskSlaStatus(createdAt, dueDate)` → `TaskSlaStatus = 'overdue' | 'dueSoon' | 'normal'`.

**hooks** — `usePostgresChanges({ table, filter, event?, onUpsert, onDelete })`; `useProfilePoints(userId, onPoints?)`.

**components/ui** — `Button`, `Card` (+ `CardAction`/`CardContent`/`CardDescription`/`CardHeader`/`CardTitle`), `Input`, `Label`, `Separator`, `Tabs`, `Modal`, `EmptyState` (empty states padronizados), `ImageUpload` (prévia/remover/envio). Tokens globais em `src/app/globals.css`; primitivas mobile-first (min-h-12, rounded-xl, `active:scale-95`).

**components por domínio** — `dashboard/dashboard-nav.tsx` (`DashboardNav({ items, userName, points })`), `dashboard/profile-editor.tsx`, `houses/houses-manager.tsx`, `tasks/tasks-admin.tsx` (`({ houseId, initialTasks, assignees })`), `tasks/tasks-dependent.tsx`, `rewards/rewards-admin.tsx` (`({ houseId, initialRewards, initialRedemptions, initialSuggestions, dependents })`), `rewards/rewards-dependent.tsx`, `auth/*` (login-form, register-form, sign-out-button), `tasks/debounced-field.tsx` (debounce 900ms + flush no blur), `tasks/task-styles.ts` (accent/chip/sla por status).

## 8. Convenções críticas de código

- Senha/`masterPin` **nunca** em `useState`/inputs controlados; forms de sucesso chamam `reset()`. Server Actions de credencial **não podem lançar exceção** (Next exibiria overlay com argumentos) — `try/catch` + `ActionResult { ok: false, error: genérico }`.
- Formulários com campo de senha: `<Input suppressHydrationWarning>` (extensões de senha causam hydration mismatch).
- Imagens do Storage: `<img>` direto (não `next/image`); warnings `no-img-element` são esperados.
- `next.config.ts` usa `module.exports` E `export default` (legado `allowedDevOrigins`) — não "consertar".
- `tsc` depende de `.next/types` gerado: apagou `.next`, rode `npm run build` antes.
- Mensagens de commit em português, curtas; commitar apenas quando solicitado.
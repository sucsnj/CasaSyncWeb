# CasaSync Web — PROJECT STATUS

## Etapa 3 — Casas, Tarefas, Pontos e Recompensas (concluída)

### Funcionalidades implementadas
- **Gestão de Casas (`/dashboard/admin/houses`):** ADMIN cria casas (código único gerado), alterna a **casa ativa** (cookie `casasync_active_house`), **cria contas de dependentes** (nome, e-mail, senha — vinculadas à casa ativa) e vê os membros vinculados.
- **`createDependent` estendido:** aceita `houseId` alvo; quando informado, a posse da casa é validada via service role (`.eq('owner_id', user.id)`) antes de vincular o dependente — evita vincular em casa que não pertence ao ADMIN mesmo com cliente adulterado.
- **Tarefas (`/tasks`, role-aware):**
  - ADMIN: cria tarefa para um dependente da casa (título, descrição, `due_date`, `points`); edita campos com **salvamento automático com debounce** (900 ms) e flush no blur; aprova tarefas concluídas creditando pontos.
  - DEPENDENTE: vê as próprias tarefas pendentes, marca como `COMPLETED`.
  - Aprovação: `COMPLETED → APPROVED` **soma** `tasks.points` em `profiles.points` (guards anti-crédito-duplicado + rollback).
- **Recompensas (`/rewards`, role-aware):**
  - ADMIN: cadastra recompensas (`points_cost`) e **aprova (`APPROVED`) ou rejeita (`REJECTED`)** resgates — aprovar **debita** os pontos do saldo.
  - DEPENDENTE: saldo ao vivo, catálogo e botão "Resgatar" com validação de saldo → cria `reward_redemptions` `PENDING`.
- **Realtime:** listeners `supabase.channel()` + `postgres_changes` (tarefas, recompensas, resgates e `profiles.points`) sincronizam Admin ↔ Dependente instantaneamente.

### Rotas / arquivos criados
- Rotas: `/dashboard/admin/houses`, `/tasks`, `/rewards`.
- Server Actions: `actions/houses.ts` (`createHouse`, `selectHouse`), `actions/tasks.ts` (`createTask`, `updateTask`, `completeTask`, `approveTask`), `actions/rewards.ts` (`createReward`, `requestRedemption`, `approveRedemption`, `rejectRedemption`).
- Helpers: `utils/house.ts` (`getSessionProfile`, `getActiveAdminHouse` via cookie, `getDependentHouse`, `getHouseAssignees`).
- Hooks Realtime: `hooks/use-postgres-changes.ts`, `hooks/use-profile-points.ts`.
- Componentes: `components/dashboard/dashboard-nav.tsx` (+ layouts admin/dependent), `components/houses/houses-manager.tsx`, `components/tasks/{debounced-field,tasks-admin,tasks-dependent}.tsx`, `components/rewards/{rewards-admin,rewards-dependent}.tsx`.
- `types/database.ts` — schema alinhado: `profiles.points`, `rewards.points_cost`, enums `task_status` (`PENDING/IN_PROGRESS/COMPLETED/APPROVED`) e `redemption_status` (`PENDING/APPROVED/REJECTED`).

### ENSINO (skill `teach` — documentação no código)
Sem saber se o CLD é invocável por modelo (`disable-model-invocation: true`), a documentação didática foi aplicada **no próprio código**:
- `hooks/use-postgres-changes.ts` — como o Realtime funciona (canal → assinatura `postgres_changes` → WebSocket; filter de casa + RLS = isolamento multi-tenant; cleanup obrigatório do canal).
- `hooks/use-profile-points.ts` — saldo ao vivo via UPDATE em `profiles` (defesa em camadas: filter `id=eq` + RLS).
- `components/tasks/debounced-field.tsx` — por que debounce evita uma chamada por tecla e flush no blur.
- `actions/tasks.ts` (approveTask) e `actions/rewards.ts` (approveRedemption) — transições guardadas (`COMPLETED→APPROVED`, `PENDING→APPROVED`), crédito/débito via cliente service-role e rollback em falha.

### Decisões arquiteturais / pontos de atenção
- **Padrão de escrita:** verificação de autorização SEMPRE via RLS/sessão (cliente autenticado: `houses.owner_id`, perfil ADMIN, `assigned_to`, casa do dependente); escritas sensíveis (crédito/débito de pontos, criação de usuários) via `utils/supabase/admin.ts` (service role, server-only).
- **Creditação de pontos em `profiles.points`** (não em `house_members`, como antes) — alinhado à spec da Etapa 3. Ajustar no banco: coluna `profiles.points int default 0`, remover `house_members.points`, renomear `rewards.cost → rewards.points_cost` e enums com valores em caixa alta.
- **Salvamento automático:** `useState` local + debounce com **flush no blur**; re-sincronização por `key={houseId}` (remount) em vez de `setState` em effect (exigência do novo linter `react-hooks/set-state-in-effect`).
- **Transição de status com guard:** `update().eq('status', ...)` impede crédito/débito duplicado em requisições concorrentes; falha na creditação reverte a tarefa/resgate ao estado anterior.
- **Realtime no Supabase:** as tabelas precisam estar na **publication `supabase_realtime`** (`alter publication supabase_realtime add table houses, house_members, profiles, tasks, rewards, reward_redemptions;`) e as policies SELECT existentes já controlam o que cada subscriber recebe.
- Status de tarefa imutáveis após `COMPLETED` (admin não edita mais; só aprova).

### Próxima etapa
1. Gerar types via `supabase gen types` para casar com o schema real (validação dos enums/colunas acima).
2. Garantir publication Realtime + políticas RLS no Supabase para as 6 tabelas.
3. Exibir o **código de acesso da casa** (`houses.code`) na UI para convite/registro de novos membros.
4. Estado vazio/UX de `IN_PROGRESS` e emoji de recompensas (campo `emoji` já tipado).

---

## Material de ensino — Segurança Supabase (workspace teach)

### O que foi criado
- Sessão da skill `teach` ativa (skill registrada em `skills-lock.json`, arquivos em `.agents/skills/teach/` — não em `.skills/`).
- `MISSION.md`, `RESOURCES.md`, `NOTES.md` (raiz) — workspace de ensino.
- `assets/lesson.css` — stylesheet compartilhado das lições.
- `lessons/0001-supabase-rls-defesa-em-camadas.html` — lição 1: cliente SSR (`utils/supabase/server.ts`) + RLS multi-tenant + Server Action `fetchMyTasks` de exemplo (defesa em camadas). Aberta no navegador.
- `reference/supabase-rls-security.html` — folha de referência (papéis anon/authenticated/service_role, padrão de policy seguro, checklist de armadilhas).

### Pontos de atenção
- Nenhum código de produção foi alterado; `fetchMyTasks` é ilustrativo (a tabela `tasks` ainda pertence à Etapa 4).
- Anotado como evolução futura: migrar `supabase.auth.getUser()` → `supabase.auth.getClaims()` no `updateSession` (docs atuais do Supabase preferem `getClaims()` no Proxy por validar assinatura do JWT a cada request).
- Conteúdo ensinado: autorização deriva da sessão (JWT verificado), nunca do input; RLS como backstop; padrão seguro `profile_id = (select auth.uid())` em policy multi-tenant; `user_metadata` não é lugar para claims de autorização; service role é server-only.

### Próxima etapa (ensino)
- Confirmação do quiz na lição 1 (2 perguntas) antes de registrar learning record.
- Lição 2 sugerida: escrita segura com `WITH CHECK` (INSERT/UPDATE) para tarefas e recompensas, ou `security definer` para evitá-la.
- Manter o restante da Etapa 4 do produto inalterado.

## Etapa 2 — Autenticação Completa (concluída)

### Funcionalidades implementadas
- **Shadcn UI configurado** (CLI v4, base Radix): `components/ui/{button,input,label,card,separator,tabs}.tsx` + `lib/utils.ts` + temas em `app/globals.css`.
- **Fluxo de Auth completo:**
  - Rota `GET /auth/callback`: troca `code` por sessão (Magic Link, Google OAuth, confirmação de e-mail) e redireciona para `/`.
  - Login em `/login` com abas **Administrador** (E-mail/Senha ou Google OAuth) e **Dependente** (E-mail/Senha criados pelo Admin).
  - Cadastro de novo ADMIN em `/register` (server action `registerAdmin`).
- **Criação de Dependentes pelo ADMIN:** server action `createDependent` (um DEPENDENT nunca se cadastra sozinho).
- **Proteção & redirecionamentos por role** no `proxy.ts` (via `updateSession`).

### Rotas / arquivos criados
- `app/auth/callback/route.ts` — callback do Supabase Auth.
- `app/login/page.tsx` + `components/auth/login-form.tsx` — login ADMIN/DEPENDENT (Tabs).
- `app/register/page.tsx` + `components/auth/register-form.tsx` — cadastro de ADMIN.
- `components/auth/sign-out-button.tsx` — logout.
- `app/dashboard/admin/page.tsx` e `app/dashboard/dependent/page.tsx` — placeholders protegidos por role.
- `actions/types.ts` (tipo `ActionResult` + validação), `actions/auth.ts` (`registerAdmin`), `actions/create-dependent.ts` (`createDependent`).
- `utils/supabase/admin.ts` — cliente **server-only** com `SUPABASE_SERVICE_ROLE_KEY`.
- `types/database.ts` — enums `user_role` (ADMIN/DEPENDENT) e `member_role` (ADMIN/DEPENDENT) + coluna `profiles.user_role`.
- `.env.local` — adicionado placeholder `SUPABASE_SERVICE_ROLE_KEY` (server-only).

### Decisões arquiteturais / pontos de atenção
- **`membership`:** o ADMIN precisa estar vinculado a pelo menos uma casa (`house_members`) para criar dependentes; a casa do dependente é a casa atual do ADMIN.
- **Sequência de segurança em `createDependent`:** valida sessão → confirma `user_role='ADMIN'` no perfil (via cliente autenticado, RLS) → busca `house_id` → usa o cliente admin (service role) para criar usuário (com `email_confirm: true`), upsert no perfil e vínculo em `house_members` com role `'DEPENDENT'`. Falhas intermediárias fazem cleanup (`deleteUser`).
- **Redirecionamentos centrados no `proxy.ts`:** `/` e rotas públicas (`/login`, `/register`) só são permitidas a anônimos; autenticados vão ao dashboard conforme `user_role`. Rotas `/dashboard/admin` e `/dashboard/dependent` são validadas pela role do usuário preguiçosamente no proxy.
- **Roles em caixa alta** (`'ADMIN'`/`'DEPENDENT'`) em `user_role` e `member_role` para alinhar a regra de negócio. **Validar com o schema real do Supabase.**
- `SUPABASE_SERVICE_ROLE_KEY` é **server-only** (nunca importar `utils/supabase/admin.ts` em client).
- Login dependente usa credenciais de e-mail/senha criadas pelo admin (não há Magic Link para dependentes nesta etapa).

### Próxima etapa
1. Preencher `.env.local` com chaves reais (URL, publishable key, service role key).
2. Configurar no Supabase: provedor Google OAuth habilitado, `Site URL`/`Redirect URLs` apontando para o app (ex: `http://localhost:3000/auth/callback`).
3. Etapa 3 — Gestão de Casa: criação de casa pelo ADMIN e área de criação de dependentes no `/dashboard/admin` (formulário chamando `createDependent`).
4. Etapa 4 — Tarefas e Recompensas (painéis ADMIN/DEPENDENT, aprovação de resgates).
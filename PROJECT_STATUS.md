# CasaSync Web — PROJECT STATUS

## UI/UX Mobile-First — redesign visual (concluída)

### Design system
- **Paleta global (`globals.css`, tokens shadcn):** background `slate-50`, texto `slate-800`, primária `blue-600` (hover `blue-700`), border/input `slate-200`, muted `slate-100`, ring azul. Cards `bg-white` com `rounded-2xl` + `border-slate-200/80` (primitiva `Card`), botões/inputs com `min-h-12` (48px de toque) e `rounded-xl`.
- **Primitivas ajustadas:** `card.tsx` (rounded-2xl, borda suave, shadow-sm), `button.tsx` (default `bg-blue-600`, tamanhos com altura mínima de 48px), `input.tsx` (min-h-12, bg-white). `layout.tsx` ganhou `bg-slate-50`/`text-slate-800`/`antialiased` e `lang="pt-BR"`.

### Navegação mobile (bottom nav)
- `dashboard-nav.tsx` agora renderiza **top nav no desktop** (`md:flex`) e **bottom navigation fixa no mobile**: `fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/90 backdrop-blur-md`, com ícones (lucide) por rota (Início, Casas, Tarefas, Recompensas), item ativo em azul, safe-area inset (iPhone) e slot de **Sair** quando há < 4 itens (dependentes).
- Containers dos layouts admin/dependent e das páginas `/tasks` e `/rewards` ganharam `pb-24 md:pb-6` para o conteúdo não ser coberto pela barra fixa.

### Cards, tarefas e recompensas
- **Tarefas (`task-styles.ts`):** mapa compartilhado de status → card com **borda esquerda colorida** (Pendente azul, Em andamento sky, Concluída âmbar, Aprovada verde) + **chip de status** e pill de pontos (`bg-sky-100 text-sky-700`). Botão "Aprovar e creditar" em verde, ícones em cada seção.
- **Recompensas:** card de saldo em gradiente azul (dependente/dashboard), emoji de recompensa, pills de custo, resgates com borda-colorida por status; "Aprovar e debitar" em verde; "Rejeitar" outline.
- **Dashboards:** header em gradiente azul ("Visão geral"/boas-vindas + casa ativa), cards de ação com ícone em chip colorido, hover lift (`-translate-y-0.5` + shadow). Houses: casa ativa com destaque azul, badges de membro por role.

### Auth
- `/login` e `/register` ganharam header de marca (ícone em quadrado azul + "CasaSync" + subtítulo) centrado, mobile-first.

### Formulários por demanda (progress disclosure)
- Exceto os de **autenticação**, todo formulário de criação só aparece ao clicar num botão: **Nova casa**, **Novo dependente** (`houses-manager.tsx`), **Nova tarefa** (`tasks-admin.tsx`) e **Nova recompensa** (`rewards-admin.tsx`).
- Padrão: `CardAction` com `Button variant="outline" size="sm"` no header do card que alterna `showXForm` (`useState`); form fecha ao sucesso (função de criar → `setShowXForm(false)`). "Novo dependente" fica `disabled` se não há casa ativa.

### Verificação
`npm run lint` ✓ · `npx tsc --noEmit` ✓ · `npm run build` ✓ · dev smoke test: `/login` e `/register` → 200 com marca renderizada.

### Notas
- Não há rota `/perfil` hoje; no mobile o 4º slot da bottom nav é o **Sair** (para dependentes, 3 itens fixos) em vez de Perfil.
- Lucide disponível (`lucide-react`); ícones usados: `LayoutDashboard, House, ListTodo, Gift, CircleCheck, CircleCheckBig, ClipboardList, Coins, PartyPopper, Layers, LogOut`.

---

## Segurança de credenciais — senha fora do estado React (concluída)

### O que foi implementado
- **Problema:** ao registrar usuários, a senha (e o `masterPin`) ficavam em `useState` como inputs controlados (`value={password}`) e eram passados como argumentos para as Server Actions. Isso deixava a credencial visível no estado do componente (React DevTools) e serializada nos argumentos da action — vulnerabilidade percebida como "senha aparece no console".
- **Fix nos forms (`login-form.tsx`, `register-form.tsx`, `houses-manager.tsx`):** removidos os estados de senha/usuario (`useState`) — inputs viraram **uncontrolled** (só `name`), com a leitura feita via `FormData(event.currentTarget)` **no momento do submit**; a senha nunca entra no estado/árvore React do cliente e é descartada após o uso. Formulários de sucesso fazem `event.currentTarget.reset()`.
- **Server Actions blindadas (`auth.ts`, `houses.ts`):** nenhuma ação pode lançar exceção não tratada (se lançasse, o Next sobreporia erro de dev com os argumentos da requisição). `createAdminClient()` (env de service role ausente) agora é envolvido em try/catch → retorna `{ ok: false, error: 'Configuração do servidor indisponível.' }` em vez de lançar.
- **Verificação:** `npm run lint` ✓ · `npx tsc --noEmit` ✓ · `npm run build` ✓.

### Limite honesto (não corrigível só com código)
- A senha **precisa** trafegar até o servidor em qualquer login/cadastro (payload de rede / aba Network do DevTools). O que o fix garante: ela **não** fica em memória/estado React do cliente, **não** é reintroduzida por nenhum log e as ações **nunca** expõem argumentos por exceção. Em produção, o tráfego é a encriptar via HTTPS.

---

## Autenticação simplificada por PIN + Username (concluída)

### O que foi implementado
- **Cadastro de ADMIN via PIN do sistema:** a Server Action `registerAdmin` (`src/actions/auth.ts`) agora recebe `fullName`, `username`, `password` e `masterPin`. Valida `masterPin === process.env.MASTER_PIN` (env `MASTER_PIN` passou a ter uso); username precisou ser único → checado em `profiles` via service role; conta criada com `admin.auth.admin.createUser({ email: "${username}@admin.casasync", password, email_confirm: true })` — usuário já **100% confirmado** (sem e-mail de confirmação); perfil gravado em `public.profiles` (`id`, `full_name`, `username`, `user_role: 'ADMIN'`), com rollback (`deleteUser`) se o perfil falhar.
- **Login por username (`src/actions/auth.ts` `login`):** normaliza o username, resolve o domínio do e-mail sintético em `profiles` conforme a role (`@admin.casasync` para ADMIN, `@dependente.casasync` para DEPENDENT) e chama `supabase.auth.signInWithPassword` pelo cliente do servidor (cookies na própria action). Mensagem genérica "Credenciais inválidas." nos dois casos (não revela usernames existentes).
- **Dependentes também por username:** `createDependent` (`src/actions/houses.ts`) agora recebe `username` em vez de e-mail; gera o e-mail sintético `@dependente.casasync`, checa unicidade e cria a conta com `email_confirm: true`. O form em `houses-manager.tsx` trocou o campo E-mail por "Nome de usuário".
- **UI em `/login`:** abas **"Entrar"** (username + senha, válido para ADMIN e DEPENDENT no mesmo form — sem Google OAuth) e **"Criar Conta Admin"** (Nome completo, Nome de usuário, Senha, PIN do sistema) em `login-form.tsx`; `register-form.tsx` atualizado para os novos campos e reutilizado na aba e na rota `/register` (mantida como URL independente).

### Pontos de atenção / próximos passos
- **Banco (necessário no Supabase):** adicionar a coluna `profiles.username` (única, lowercase) e preencher/validar para contas existentes. Sem a coluna, o cadastro/login por username falha.
- Removido o login com **Google** (não faz sentido sem e-mail). `src/app/auth/callback/route.ts` ficou sem uso — pode ser removido em etapa futura.
- `validateCredentials`/`EMAIL_PATTERN` removidos de `actions/types.ts`; novos helpers `validateUsername` (3–24 chars, `[a-z0-9._-]`) e `validatePassword` (≥6).
- Gerar types via `supabase gen types` para casar com o schema real (inclui `username`).

---

## Manutenção pós-migração para `src/` (concluída)

### Verificação
`npm run lint` ✓ · `npx tsc --noEmit` ✓ · `npm run build` ✓ · `next dev` ✓ (rotas/proxy OK; `/login` e `/register` renderizando sem erros; rotas protegidas redirecionando para `/login`).

### Bugs reais encontrados e corrigidos
- **Login com ordem garantida (auth → `profiles`):** o login por e-mail/senha era feito no cliente e só consultava `profiles` depois, no proxy. Criada a Server Action `login` em `src/actions/auth.ts` que executa `signInWithPassword` PRIMEIRO e somente após confirmar ausência de erro de auth busca `user_role` na tabela `profiles` (via RLS) para redirecionar ao dashboard da role. As cookies são gravadas na própria action; o browser client (via `createClient`) continua sendo usado apenas no login com Google. `login-form.tsx` agora chama a action.
- **Hydration error no login/register (extensão de gerenciador de senhas):** o browser injeta `style`/botões nos inputs de e-mail/senha após o SSR → mismatch de atributos. Adicionado `suppressHydrationWarning` aos inputs afetados em `login-form.tsx`, `register-form.tsx` e `houses-manager.tsx` (fix canônico do React para o caso de extensão do navegador).
- **`updateTask` com `assigned_to: ''`:** ao desatribuir um dependente ("Sem atribuição"), uma string vazia era enviada para a coluna `uuid` → erro do Postgres. Agora `''` é normalizado para `null` (`src/actions/tasks.ts`).
- **Dropdown de atribuição sem update otimista:** o `<select>` controlado só refletia a mudança quando o Realtime ecoava (ou nunca, sem publication). Agora atualiza o estado otimista e envia `null` para desatribuir (`src/components/tasks/tasks-admin.tsx`).
- **`handleRedeem`/`handleComplete` sem catch:** se a Server Action disparasse uma exceção de rede, `pendingId` ficava travado em "Resgatando..." e a rejection ficava sem tratamento. Protegidos com `try/catch/finally` (`src/components/rewards/rewards-dependent.tsx`, `src/components/tasks/tasks-dependent.tsx`).

---

## Refatoração de estrutura (concluída)

### O que foi feito
- **Migração para `src/`:** todo o código de aplicação foi movido para uma pasta `src/` (Next.js passa a usar `src/app` como rota do App Router — detectado automaticamente).
- **`@/` alias atualizado:** `tsconfig.json` agora mapeia `"@/*": ["./src/*"]`; todas as importações `@/...` continuam resolvendo sem alteração de arquivo.
- **`proxy.ts` movido para `src/proxy.ts`:** conforme docs do Next.js 16, o arquivo de proxy deve ficar no mesmo nível de `app` (`src/app`) — build continua exibindo `ƒ Proxy (Middleware)`.
- **Route group `(auth)`:** `/login` e `/register` agora vivem em `src/app/(auth)/` (grupo de rota sem efeito na URL; `PUBLIC_PATHS` do proxy segue válido).
- **Server Actions reunidas por domínio:** `createDependent` foi mesclado em `src/actions/houses.ts` (junto de `createHouse`/`selectHouse`), removendo `actions/create-dependent.ts`.
- **`components.json` atualizado:** caminho do CSS global para `src/app/globals.css` (aliases `@/components`, `@/lib/utils`, `@/hooks` já compatíveis).
- Sem mudança de importações nos componentes (padrão já usava alias `@/`); `next-env.d.ts`, `next.config.ts` e `.env.local` permanecem na raiz.

### Nova árvore de diretórios
```
src/
├─ app/                        # Rotas do App Router (src/app)
│  ├─ (auth)/                  # Grupo de rota (sem efeito na URL)
│  │  ├─ login/page.tsx
│  │  └─ register/page.tsx
│  ├─ auth/callback/route.ts   # Route handler do callback Supabase
│  ├─ dashboard/
│  │  ├─ admin/                # Visão ADMIN (layout, visão geral, houses/)
│  │  └─ dependent/            # Visão DEPENDENT (layout, visão geral)
│  ├─ tasks/page.tsx           # Tarefas (role-aware)
│  ├─ rewards/page.tsx         # Recompensas (role-aware)
│  ├─ layout.tsx · globals.css · page.tsx
├─ components/                 # Componentes por domínio
│  ├─ ui/                      # Shadcn UI (button, card, input, label, separator, tabs)
│  ├─ auth/                    # login-form, register-form, sign-out-button
│  ├─ dashboard/               # dashboard-nav
│  ├─ tasks/                   # debounced-field, tasks-admin, tasks-dependent
│  ├─ rewards/                 # rewards-admin, rewards-dependent
│  └─ houses/                  # houses-manager
├─ actions/                    # Server Actions por domínio
│  ├─ auth.ts · types.ts
│  ├─ houses.ts                # createHouse, selectHouse, createDependent
│  ├─ tasks.ts
│  └─ rewards.ts
├─ utils/
│  ├─ house.ts                 # helpers de sessão/casa ativa
│  └─ supabase/                # server.ts, client.ts, admin.ts, middleware.ts
├─ types/
│  └─ database.ts              # schema tipado (profiles, tasks, rewards…)
├─ hooks/                      # use-postgres-changes, use-profile-points
└─ lib/
   └─ utils.ts                 # cn() (é a lib habitada; componentes ui usam pkg `cn`)
proxy.ts                        # proxy (Middleware) — raiz do src/
```
Raiz mantém: `AGENTS.md`, `PROJECT_STATUS.md`, `next.config.ts`, `tsconfig.json`, `components.json`, `eslint.config.mjs`, `.env.local`, `next-env.d.ts`, docs de ensino.

### Verificação
`npx tsc --noEmit` ✓ · `npm run lint` ✓ · `npm run build` ✓ (rotas idênticas às de antes; `ƒ Proxy (Middleware)` ativo).

---

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
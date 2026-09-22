---
description: Carrega arquitetura e modelo de dados completos do CasaSync para tarefas que exigem profundidade (opcional: foque em $ARGUMENTS).
---

# Contexto completo — CasaSync Web

Você recebeu o contexto integral do projeto abaixo (arquitetura, modelo de dados, regras, superfície de API). Use-o como base **sem reler toda a base de código**; consulte apenas o arquivo-fonte envolvido quando precisar de exatidão de uma linha específica.

Foco opcional: $ARGUMENTS

**Contrato de uso — não repita este documento; aplique-o silenciosamente:**
1. Responda à solicitação do usuário (feita depois/como desdobramento do `/context`) usando o contexto abaixo como fonte.
2. Se `$ARGUMENTS` veio vazio, responda em 1–2 linhas confirmando que está contextualizado e aguarde a tarefa.
3. Se `$ARGUMENTS` citar uma área (ex: "tarefas", "auth", "recompensas"), aprofunde nela; se citar tabela/coluna, valide contra o modelo de dados.
4. Ao referenciar código, aponte o arquivo real (ex: `src/actions/tasks.ts:240`).

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
4. **Realtime** sincroniza Admin ↔ Dependente via `src/hooks/use-postgres-changes.ts` (canal + `postgres_changes`, filter de `house_id` nas tabelas de negócio e `recipient_id` nas notificações) e `src/hooks/use-profile-points.ts` (saldo ao vivo). O hook faz `await getSession()` + `await realtime.setAuth(access_token)` **antes** de assinar: sessão restaurada de cookies conecta como `anon` e o RLS descarta os eventos em silêncio (`SUBSCRIBED` sem entregas) — não remover. Ver ADR-0010.
5. **`Modal` (`src/components/ui/modal.tsx`)**: renderiza via **portal no `body`** (`z-[100]`), **trava o scroll** do documento, **prende o foco (Tab/Shift+Tab)** dentro da janela e fecha no **Esc** (restaura o foco anterior). Usado por sino/casas/recompensas/tarefas.

## 3. Supabase

- **3 clientes** em `src/utils/supabase/`:
  - `server.ts` `createClient()` — regras de Server Component/RSC.
  - `client.ts` `createClient()` — browser.
  - `admin.ts` `createAdminClient()` — **service role, server-only, nunca importar de client component**.
- **Env vars** (só `.env.local`, `.env*` gitignored): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (é *publishable*, não `ANON_KEY`), `SUPABASE_SERVICE_ROLE_KEY`, `MASTER_PIN` (valida cadastro ADMIN), `PIN_PTS` (valida alteração manual de pontos de dependente).
- **Auth:** sem e-mails reais — e-mails sintéticos `${username}@admin.casasync` (ADMIN) ou `${username}@dependente.casasync` (DEPENDENT), criados com `email_confirm: true` via service role. Login resolve username → e-mail sintético → `signInWithPassword` pelo servidor. DEPENDENT **nunca se cadastra sozinho**.
- **Padrão de autorização:** SEMPRE derivada da sessão — nunca do input/cliente. O cliente service-role (`createAdminClient`, server-only) é usado para (a) **escritas que o RLS não cobre** (criação de usuários, crédito/débito de pontos) e (b) **leituras cross-role que o RLS não atende** (casas/membros/atribuições e tarefas/recompensas). Nestas, o escopo é sempre explícito e derivado da sessão (`getSessionProfile().user.id`, casa ativa via `getActiveAdminHouse`, `houseId`), nunca de parâmetro público. Ver ADR-0006.
- **Controle de casa = membresia, não `owner_id`:** o ADMIN controla as casas onde tem `house_members.role='ADMIN'` (criadas E co-geridas via PIN em `joinHouseByPin`). `houses.owner_id` identifica apenas o tutor/criador.
- **Transições de status com guard** (`update().eq`/`.in('status', ...)`): impedem crédito/débito/desaprovação duplicados e revertem ao estado anterior em falha. Ex.: `COMPLETED → APPROVED` (credita), `PENDING/IN_PROGRESS → APPROVED` (`adminCompleteTask`, credita), `COMPLETED → PENDING` (`rejectCompletedTask`, sem crédito), `APPROVED → PENDING` (`restoreTask`, sem mexer nos pontos) e `PENDING/IN_PROGRESS → NOT_DELIVERED` (`markTaskNotDelivered`, debita).
- **Realtime:** tabelas devem estar na publication `supabase_realtime`.
- **Migrações SQL não versionadas:** pasta `supabase/` não existe (`supabase/*.sql` gitignored) — mudanças de schema são aplicadas manualmente no dashboard Supabase. **Todos os scripts já documentados foram aplicados no banco — nada está pendente:** colunas de imagem (incluindo `rewards.active` e `notifications.image_url`/`message_id` da mensagem rápida), `reward_suggestions`, flags `extension_*`, enum `task_status` com `NOT_DELIVERED`, tabela `notifications` + policy de SELECT + publication `supabase_realtime`, e o bucket público `casasync-media` (com a pasta `messages`). Blocos de SQL em `PROJECT_STATUS.md` são **registro histórico**.

## 4. Rotas

| rota | papel |
|---|---|
| `/login`, `/register` | grupo `(auth)`; `/login` tem abas Entrar (username+senha) e Criar Conta Admin (com MASTER_PIN) |
| `/dashboard/admin` (+ layout) | visão geral ADMIN (inclui card "Configurações") |
| `/dashboard/admin/houses` | gestão de casas/dependentes |
| `/dashboard/admin/settings` | configurações da casa (economia de pontos, mensagem rápida, prazos, adiamento, notificações) |
| `/dashboard/dependent` (+ layout) | visão geral DEPENDENT (inclui card "Seu tutor"/"Seus tutores") |
| `/tasks` | role-aware (ADMIN aprova/gerencia; DEPENDENT vê as próprias) |
| `/rewards` | role-aware (ADMIN aprova resgates/sugestões; DEPENDENT catálogo + saldo) |

Nav (header fixo azul + bottom nav mobile) em `src/components/dashboard/dashboard-nav.tsx`, itens ativos por role: `/dashboard/admin`, `/dashboard/dependent`, `/dashboard/admin/houses`, `/tasks`, `/rewards`. O **avatar** do header é um botão que abre um `Modal` "Sua conta" (nome + pontos + `SignOutButton`) — garante "Sair" em qualquer largura (o "Sair" do header é `md+` e o slot extra da bottom nav só existe com < 4 itens). `points` é passado **só para DEPENDENT** (ADMIN não acumula pontos; badge e linha de pontos somem quando `points` não é número).

## 5. Modelo de dados (espelho de `src/types/database.ts`)

Enums (valores em **caixa alta**, regra de negócio):
- `user_role` / `member_role` = `ADMIN` | `DEPENDENT`
- `task_status` = `PENDING` | `IN_PROGRESS` | `COMPLETED` | `APPROVED` | `NOT_DELIVERED`
- `redemption_status` = `PENDING` | `APPROVED` | `REJECTED`

**profiles** — `id` (uuid PK → auth.users), `username` (única lowercase), `full_name`, `avatar_url`, `user_role`, `points` (int, saldo), `created_at`, `updated_at`.

**houses** — `id`, `name`, `code` (código único de convite), `owner_id` (FK → profiles; posse validada via service role), `image_url`, `created_at`, `updated_at`.

**house_members** — `id`, `house_id` (FK → houses), `profile_id` (FK → profiles), `role` (`member_role`), `created_at`, `updated_at`.

**tasks** — `id`, `house_id` (FK; isolamento multi-tenant), `title`, `description`, `points`, `status` (`task_status`), `assigned_to` (FK → profiles, nullable), `created_by`, `completed_by`, `completed_at`, `due_date`, `image_url`, `extension_requested` (bool), `extension_reason`, `created_at`, `updated_at`. *(Edições em PENDING/IN_PROGRESS e em NOT_DELIVERED (prazo/título/descrição/atribuição; pontos não); `''` normalizado para null em `assigned_to`.)* *`due_date` é `timestamptz` e **sempre gravado com fuso**: o cliente envia o instante ISO (`datetimeLocalToIso`) e o servidor (`normalizeDueDate`) rejeita string naive — a naive seria interpretada como UTC pelo Postgres e deslocaria o prazo (bug de 3h, ver ADR-0013).*

**rewards** — `id`, `house_id`, `active` (bool, default true; `false` = desativada — indisponível, nunca excluída; guard em `requestRedemption`; **coluna já aplicada no Supabase**), `title`, `description`, `points_cost`, `emoji`, `image_url`, `created_by`, `created_at`, `updated_at`.

**reward_redemptions** — `id`, `house_id`, `reward_id`, `profile_id`, `status` (`redemption_status`), `approved_by`, `points_cost` (snapshot do custo), `resolved_at`, `created_at`, `updated_at`.

**reward_suggestions** — `id`, `house_id`, `profile_id`, `title`, `description`, `points_cost` (nullable; `?? 5` ao aprovar), `image_url`, `status` (`PENDING` | `APPROVED` | `REJECTED`), `created_at`, `updated_at`.

**notifications** — `id`, `house_id`, `recipient_id` (FK → profiles, quem recebe), `actor_id` (FK → profiles, nullable, quem agiu), `type` (`NotificationType` em `src/types/notifications.ts`, inclui `QUICK_MESSAGE`), `title`, `body`, `link` (nullable), `image_url` (nullable, mensagem rápida), `message_id` (uuid nullable, agrupa as cópias de um mesmo envio de mensagem rápida), `read_at` (nullable; `null` = não lida), `created_at`. Uma linha por destinatário.

**Fora do types (não verificável no código):** bucket público `casasync-media` (pastas avatars/houses/rewards/tasks/suggestions/messages) + policies; RLS multi-tenant por `house_id`/owner (as **leituras cross-role** vão por service role com escopo de sessão — ADR-0006; a RLS é exigida sobretudo pelo Realtime, que roda no browser; `notifications` tem policy SELECT para `recipient_id = auth.uid()`); publication `supabase_realtime` com houses, house_members, profiles, tasks, rewards, reward_redemptions, reward_suggestions, notifications.

## 6. Regras de negócio

- Hierarquia: Admin → Casa(s) → Dependente(s) → Tarefas/Recompensas, isoladas por `house_id` (RLS) — multi-tenant. `ADMIN` cria/aprova tarefas, recompensas, resgates e dá crédito/débito de pontos.
- **Ciclo da tarefa:** DEPENDENT conclui (`COMPLETED`); ADMIN **aprova** (credita), **desaprova** (`COMPLETED → PENDING`, sem crédito) ou **conclui+credita** de uma vez (`adminCompleteTask`, `PENDING/IN_PROGRESS → APPROVED`) mesmo sem atraso.
- `approveTask`: `COMPLETED → APPROVED` **soma** `tasks.points` em `profiles.points`; depois de COMPLETED a tarefa é imutável para edição.
- `approveRedemption`: `PENDING → APPROVED` **debita** `points_cost` do saldo; `rejectRedemption`: `PENDING → REJECTED`.
- **Tarefa "não entregue" (`NOT_DELIVERED`):** ADMIN marca uma tarefa **atrasada** (`markTaskNotDelivered`, `PENDING/IN_PROGRESS → NOT_DELIVERED`, guard) e **debita** `tasks.points` do dependente — o saldo **pode ficar negativo**. O dependente perde o "Concluir" mas mantém o pedido de adiamento. Aprovar o adiamento (`resolveTaskExtension`) ou alterar o prazo (`updateTask`) **devolve os pontos** e **zera** `tasks.points`, voltando o status ao equivalente ao novo prazo (futuro → `PENDING`). Não há "Concluir e creditar" para `NOT_DELIVERED`. Ver ADR-0007.
- **Restaurar tarefa aprovada:** ADMIN reaproveita uma `APPROVED` via `restoreTask` (`APPROVED → PENDING`, guard) em vez de criar outra idêntica. Preserva os dados e **não altera os pontos já creditados**; limpa `completed_*`/flags de adiamento e reinicia o prazo para **agora + `defaultDueDays` dias** (settings `task_sla`; default 1). Ver ADR-0008.
- **SLA de prazo** (`src/utils/task-sla.ts`): `overdue` (agora > prazo; card `border-red-500/red-50/red-700`) e `dueSoon` (restante ≤ `dueSoonRatio` do total — settings `task_sla`, default 0.2; 0 desliga; `border-amber-400/amber-50/amber-800`). Estilos em `src/components/tasks/task-styles.ts` (inclui chip/borda de `NOT_DELIVERED`).
- **Prazos SEMPRE com fuso:** `<input type="datetime-local">` produz hora local sem fuso — o **cliente** converte em instante via `datetimeLocalToIso` (`src/utils/datetime-local.ts`, fuso do dispositivo, client-only) antes de `createTask`/`updateTask`, e o **servidor** (`normalizeDueDate`) rejeita qualquer `due_date` sem fuso (`Z`/`±HH:MM`), fail-closed. **Exibir hora local de um instante em JSX sempre renderizado:** use `FormattedDateTime` (`src/components/ui/formatted-date.tsx`) — formatar com getters locais no SSR (Vercel/Netlify = UTC) causa hydration mismatch; nunca soltar `toLocaleString(...)` num card sempre renderizado. Ver ADR-0013.
- **Pedido de adiamento:** dependente define `extension_requested=true` + `extension_reason` (obrigatório, ≤ 500); ADMIN **aprova** (botões +1 dia/+3 dias sobre a data atual ou futura; em `NOT_DELIVERED` devolve os pontos) ou **rejeita** (`resolveTaskExtension`); flags limpas nos dois casos.
- **Sugestões de recompensa:** dependente envia; ADMIN aprova → **cria a recompensa real** (transição guardada `PENDING→APPROVED` com rollback) ou rejeita.
- **Desativação de recompensa:** ADMIN alterna `rewards.active` (`setRewardActive`); desativada **nunca é excluída**, fica **"Indisponível"** na loja do dependente e `requestRedemption` rejeita (`active = false`). Só o ADMIN reativa; resgates já resolvidos não são afetados.
- **Notificações:** cada ação relevante grava notificações para "o outro lado" (dependente para ações do ADMIN; todos os ADMINs membros para ações do dependente; quem agiu é excluído). Registro **best-effort** (`src/utils/notifications.ts`: `notifyUser`/`notifyHouse`) — falha não derruba a ação. Gerenciadas pelo destinatário (marcar lida/todas, apagar uma/todas) e **lidas comuns apagadas após `readRetentionDays`** (settings `notification_retention`, default 5; limpeza lazy **por casa da notificação** e **excluindo `QUICK_MESSAGE`** em `cleanupReadNotifications`/`getMyNotifications`, sem `pg_cron`). Ver ADR-0009.
- **Mensagem rápida (DEPENDENT → ADMINs):** `sendQuickMessage(text, imageUrl?)` — só DEPENDENT; texto ≤100 caracteres opcional (exige texto OU imagem) e imagem = URL pública do bucket na pasta `messages/`; **capacidade**: envia apenas enquanto tiver **menos de 2** mensagens próprias acumuladas (lidas ou não; conta `message_id` distintos, não cópias); insere 1 cópia por ADMIN da casa com o mesmo `message_id` **+ 1 cópia para o próprio dependente como comprovante já lido** ("Mensagem enviada", sem edição, não conta na retenção) e **envia push aos ADMINs** (best-effort, quem agiu excluído). Ao abrir uma `QUICK_MESSAGE` no sino o visualizador marca como lida (sem link); **retenção** "2 lidas → apaga a mais antiga" em `cleanupQuickMessages` (disparado em `markNotificationRead`/`markAllNotificationsRead`; apaga todas as cópias + imagem no storage; a cópia do remetente é ignorada na contagem). Composer no sino só do DEPENDENT (`quick-message-composer.tsx`: galeria + câmera ao vivo `getUserMedia` com fallback). Constantes em `src/utils/quick-message.ts` (`QUICK_MESSAGE_MAX_CHARS=100`, `MAX_IMAGE_MB=5`, `CAPACITY=2`).
- **Reset de senha pelo ADMIN:** `updateMemberPassword` (service role, sem e-mail) redefine a senha de dependentes E co-ADMINs de casas que o ator controla; escopo por `house_members`, senha `>= 6`, sessões ativas **não** revogadas. Ver ADR-0011.
- **Alteração de pontos pelo ADMIN:** `updateDependentPoints` (service role) faz **SET absoluto** de `profiles.points` de um dependente exigindo o PIN `PIN_PTS` (fail closed); escopo = alvo `DEPENDENT` de casa que o ator controla; valor inteiro em `POINTS_MIN/POINTS_MAX` (`validatePoints`), pode ser negativo. Ver ADR-0012.
- **Casa ativa do ADMIN** via cookie `casasync_active_house` (const `ACTIVE_HOUSE_COOKIE` em `src/utils/house.ts`).

## 7. Superfície de API

**actions/types.ts** — `ActionResult`, `USERNAME_PATTERN` (`/^[a-z0-9._-]{3,24}$/`), `validateUsername`, `validatePassword`, `validatePoints` (+ `POINTS_MIN=-1000000`, `POINTS_MAX=1000000`).

**actions/auth.ts** — `registerAdmin(fullName, username, password, masterPin)`, `login(username, password)`, `updateOwnProfile({ fullName?, avatarUrl? })`.

**actions/houses.ts** — `createHouse(name)`, `selectHouse(houseId)`, `createDependent(fullName, username, password, houseId?)`, `updateHouse({ name?, imageUrl? })`, `updateDependentProfile(dependentId, { fullName?, username?, avatarUrl? })`, `updateMemberPassword(targetUserId, newPassword)` (service role, escopo por `house_members`; `>= 6`; não revoga sessões), `updateDependentPoints(dependentId, newPoints, pinPts)` (SET absoluto de `profiles.points`; exige `PIN_PTS`; alvo `DEPENDENT` de casa sua).

**actions/tasks.ts** — `createTask({ title, description, dueDate, points, assignedTo, imageUrl })`, `updateTask(taskId, patch: TaskPatch)` (`TaskPatch`: title/description/due_date/points/assigned_to/image_url), `completeTask(taskId)`, `approveTask(taskId)`, `rejectCompletedTask(taskId)`, `adminCompleteTask(taskId)`, `markTaskNotDelivered(taskId)`, `restoreTask(taskId)`, `requestTaskExtension(taskId, reason)`, `resolveTaskExtension(taskId, approve: boolean, days = 3)`. *(`createTask`/`updateTask` passam o `due_date` por `normalizeDueDate` — **rejeita string sem fuso** (fail-closed), ver ADR-0013. `resolveTaskExtension` rejeita `days` fora de `dayOptions` das settings `extension_rules` da casa.)*

**actions/rewards.ts** — `createReward({ title, description, pointsCost, emoji?, imageUrl? })`, `requestRedemption(rewardId)` (guarda `active`), `approveRedemption(redemptionId)`, `rejectRedemption(redemptionId)`, `updateReward(rewardId, patch: RewardPatch)` (title/description/points_cost/emoji/image_url), `setRewardActive(rewardId, active: boolean)` (ADMIN; desativa/reativa sem excluir), `createRewardSuggestion({ title, description, pointsCost?, imageUrl? })`, `resolveRewardSuggestion(suggestionId, approve: boolean)`.

**actions/notifications.ts** — `markNotificationRead(id)` (em `QUICK_MESSAGE` dispara `cleanupQuickMessages`), `markAllNotificationsRead()` (idem), `deleteNotification(id)`, `deleteAllNotifications()`, `purgeReadNotifications()`, `sendQuickMessage(text, imageUrl?)` (só DEPENDENT, capacidade ≤2 mensagens, 1 cópia por ADMIN) — escopo sempre `recipient_id = user.id`.

**utils/house.ts** — `getSessionProfile()` → `{ user, profile }` (`profile.avatar_url` incluso), `getAdminHouses(userId)` (casas controladas = criadas + co-geridas), `getActiveAdminHouse()` (via cookie), `getDependentHouse(userId)`, `getHouseAssignees(houseId)` (dependentes), `getHouseTutors(houseId)` (todos os ADMIN membros), `getProfileNames(ids)` (mapa `id → nome`, p/ criador de tarefa), `withAdminClient<T>(fn)`, `ACTIVE_HOUSE_COOKIE`. *(`getSessionProfile` e `getAdminHouses` são envoltos em `React.cache` — memoização **por request**; não "consertar" adicionando args ou leituras que quebrem a deduplicação.)*

**utils/notifications.ts** — `READ_RETENTION_DAYS` (5, **default histórico** — a fonte real é a settings `notification_retention` da casa), `notifyUser(admin, {...})`, `notifyHouse(admin, { side: 'ADMINS'|'DEPENDENTS', excludeUserId, ... })` (ambas com passthrough opcional de `imageUrl`/`messageId`), `cleanupReadNotifications(admin, recipientId)` (apaga lidas comuns **por casa da notificação** — cada casa aplica seu `readRetentionDays` — e **exclui `QUICK_MESSAGE`**), `getMyNotifications(userId)` (limpeza lazy + lista), `cleanupQuickMessages(admin, houseId, actorId)` (retenção "2 lidas → apaga a mais antiga" das QUICK_MESSAGE + imagem do storage). Best-effort (service-role).

**utils/media.ts** — `MEDIA_BUCKET = 'casasync-media'`, `uploadMedia(folder: MediaFolder, file)` — `MediaFolder = 'avatars' | 'houses' | 'rewards' | 'tasks' | 'suggestions' | 'messages'`.

**utils/task-sla.ts** — `getTaskSlaStatus(createdAt, dueDate, now = new Date(), dueSoonRatio = 0.2)` → `TaskSlaStatus = 'overdue' | 'dueSoon' | 'normal'`.

**utils/house-settings.ts** — getters cached com fallback aos defaults de `src/utils/settings.ts`: `getHouseRewardPricingSettings`, `getHouseQuickMessageSettings`, `getHouseTaskSlaSettings` (`defaultDueDays`/`dueSoonRatio`), `getHouseExtensionRulesSettings` (`dayOptions`), `getHouseNotificationRetentionSettings` (`readRetentionDays`), e `getHouseSettingsValue(houseId, key)` interno. Lidos por `/dashboard/admin/settings` e repassados às páginas (`/tasks` → `TasksAdmin`/`TasksDependent`; call sites DEPENDENT da mensagem rápida).

**actions/settings.ts** — `updateHouseSettings(key: HouseSettingsKey, patch)` (service role + membresia ADMIN; validação por chave fail-closed; únicos caminhos de escrita de `house_settings`). Revalida `/dashboard/admin/settings` sempre, + `/tasks`/`/rewards`/`/dashboard/dependent` quando `quick_message`, + `/tasks` quando `task_sla`/`extension_rules`.

**utils/datetime-local.ts** — `datetimeLocalToIso(naive)` (valor naive do `datetime-local` → instante ISO no fuso do dispositivo, client-only; `null` p/ inválido ou fora do browser), `isoToDateTimeLocalValue(iso)`, `nowDateTimeLocalValue()`, `modifyDateTimeLocal(value, days?, hours?)`.

**hooks** — `usePostgresChanges({ table, filter, event?, onUpsert, onDelete })`; `useProfilePoints(userId, onPoints?)`.

**components/ui** — `Button`, `Card` (+ `CardAction`/`CardContent`/`CardDescription`/`CardHeader`/`CardTitle`), `Input`, `Label`, `Separator`, `Tabs`, `Modal` (portal no `body` `z-[100]`, scroll lock, focus trap Tab/Shift+Tab, fecha no Esc), `EmptyState` (empty states padronizados), `ImageUpload` (prévia/remover/envio), `FormattedDateTime` (`({ iso })` — hora local **só após hidratação** via `useSyncExternalStore`, placeholder estável antes; use em qualquer JSX sempre renderizado que mostre `due_date`), `PageSkeleton` (skeleton `animate-pulse` do visual do app, usado pelos `loading.tsx` de `tasks/`, `rewards/` e os três segmentos de dashboard). Tokens globais em `src/app/globals.css`; primitivas mobile-first (min-h-12, rounded-xl, `active:scale-95`).

**components por domínio** — `dashboard/dashboard-nav.tsx` (`DashboardNav({ items, userName, points, userId, notifications, role? })` — renderiza o sino e um `Modal` "Sua conta" aberto pelo avatar, com `SignOutButton`; `role` controla o composer de mensagem rápida no sino (`canSend` só `DEPENDENT`)), `dashboard/profile-editor.tsx`, `houses/houses-manager.tsx` (cards com PIN copiável + abas Criar/Entrar com PIN; por membro: pill de role e, p/ dependentes, pill "N pts" + botões "Senha"/`Key`, "Pontos"/`Coins` (PIN_PTS) e "Editar"/`Pencil`, todos em `Modal` com feedback inline), `tasks/tasks-admin.tsx` (`({ houseId, initialTasks, assignees, defaultDueDays = 1, dueSoonRatio = 0.2, extensionDayOptions = [1,3] })` — props de settings da casa: prazo padrão do form/restauro, ratio do chip SLA e dias dos botões de adiamento; cards **colapsáveis** recolhidos por padrão, ações Aprovar/Desaprovar/Concluir e creditar/Não entregue/Restaurar/adiamento; no mobile o título fica acima dos chips/botões, lado a lado em `sm:`; **upload de imagem de tarefas DESABILITADO** — import/estado `taskImageUrl`/bloco JSX comentados para não inflar o storage; coluna `tasks.image_url` e actions intactas, imagens antigas seguem exibidas), `tasks/tasks-dependent.tsx` (`({ houseId, initialTasks, creatorNames, dueSoonRatio = 0.2 })`; sem "Concluir" em `NOT_DELIVERED`, mostra "Criada por {nome}", chips/meta abaixo do título+descrição), `rewards/rewards-admin.tsx` (`({ houseId, initialRewards, initialRedemptions, initialSuggestions, dependents })` — catálogo com botões **Desativar/Reativar** + chip "Inativa"), `rewards/rewards-dependent.tsx` (recompensa desativada acinzentada com **"Indisponível"** e sem botão de resgate), `settings/settings-admin.tsx` (`SettingsAdmin({ rewardPricing, quickMessage, taskSla, extensionRules, notificationRetention })` — cards **Economia de pontos** (toggle + faixas/taxas/piso), **Mensagem rápida** (maxChars/maxImageMb/capacity), **Prazos de tarefas** (`CalendarClock`; `defaultDueDays` + `dueSoonRatio`), **Adiamento de tarefas** (`Clock3`; lista dinâmica de `dayOptions`, 1–5 opções de 1–90 dias) e **Notificações** (`BellRing`; `readRetentionDays`) — savers por seção chamam `updateHouseSettings` + `router.refresh()`), `auth/*` (login-form, register-form, sign-out-button), `tasks/debounced-field.tsx` (debounce 900ms + flush no blur), `tasks/task-styles.ts` (accent/chip/sla por status), `notifications/notifications-bell.tsx` (`NotificationsBell({ userId, initialNotifications, canSend? })` — sino no cabeçalho via `DashboardNav`: badge de não lidas, painel em `Modal`, marcar lida/todas, apagar uma/todas, realtime por `recipient_id`; composer de mensagem rápida quando `canSend`; cards de `QUICK_MESSAGE` **colapsáveis** — tocar no cabeçalho expande o texto completo + imagem em tamanho real e marca como lida, **recolhidos por padrão** (`expandedQuickIds`)), `notifications/quick-message-composer.tsx` (`QuickMessageComposer({ userId })` — **colapsável pelo cabeçalho** (inicia recolhido, chevron gira), texto ≤100 com contador, galeria `accept="image/*"` + câmera ao vivo `getUserMedia`, validação de 5MB/só-imagem, preview com remover, envio via `sendQuickMessage` — o dependente também recebe a própria mensagem como notificação simples "Mensagem enviada", já lida, sem edição).

## 8. Convenções críticas de código

- Senha/`masterPin` **nunca** em `useState`/inputs controlados; forms de sucesso chamam `reset()`. Server Actions de credencial **não podem lançar exceção** (Next exibiria overlay com argumentos) — `try/catch` + `ActionResult { ok: false, error: genérico }`.
- Formulários com campo de senha: `<Input suppressHydrationWarning>` (extensões de senha causam hydration mismatch).
- Imagens do Storage: `<img>` direto (não `next/image`); warnings `no-img-element` são esperados.
- `next.config.ts` usa `module.exports` E `export default` (legado `allowedDevOrigins`) — não "consertar".
- `tsc` depende de `.next/types` gerado: apagou `.next`, rode `npm run build` antes.
- Mensagens de commit em português, curtas; commitar apenas quando solicitado.
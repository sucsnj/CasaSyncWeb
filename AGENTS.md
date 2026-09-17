<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# CasaSync Web — Diretrizes do Projeto

## 1. Comandos de verificação (não há testes configurados)
- `npm run dev` · `npm run lint` (eslint) · `npm run typecheck` (`tsc --noEmit`) · `npm run build`.
- Ordem antes de entregar: **lint → typecheck → build**. Todos devem passar.
- `npm run lint` emite warnings `no-img-element` **esperados** (uso deliberado de `<img>` para URLs públicas do Storage) — não "consertar" trocando por `next/image`.
- `tsc` depende do gerado `.next/types` (ex: `LayoutProps<"/">` em `src/app/layout.tsx`). Se `.next/` for apagado, rode `npm run build` (ou `next dev`) antes do `tsc` puro.
- Rodar `npm run build` antes de `npm run dev` para evitar geração conflitante de `.next`.

## 2. Estrutura e convenções
- Todo o código de app vive em `src/`; alias `@/*` → `./src/*` (tsconfig). Há um route group `(auth)` (URLs `/login` e `/register` sem o prefixo).
- **Next.js 16 trocou middleware por proxy:** a proteção de rotas fica em `src/proxy.ts` (export `proxy` + `config.matcher`, ao lado de `src/app`); a lógica de sessão/role vive em `src/utils/supabase/middleware.ts`.
- `next.config.ts` usa `module.exports` E `export default` (legado com `allowedDevOrigins`). Não "consertar" isso.
- `PROJECT_STATUS.md` é o estado do projeto (requerido ler ANTES de trabalhar e ATUALIZAR ao terminar — funcionalidades, arquivos, decisões, próximo passo).
- Docs complementares (commitados): `docs/schema.md` (snapshot do schema Supabase) e `docs/adr/` (decisões arquiteturais — o "porquê" de padrões como service role/credenciais/proxy/leituras cross-role).
- **Tarefas (ADMIN) — `src/components/tasks/tasks-admin.tsx`:** cards **colapsáveis** com cabeçalho clicável (chip de status/SLA + título + pontos + chevron), **todos recolhidos por padrão** (`expandedIds: Set<string>`). Aplicado a pendentes/concluídas/aprovadas; no card concluído os botões "Aprovar"/"Desaprovar" e no card aprovado o botão "Restaurar" ficam sempre visíveis, fora do toggle. **Mobile:** o título fica na linha de cima e chips/pontos/botões descem para uma linha abaixo (em `sm:` voltam a ficar lado a lado) — não regredir para uma única linha fixa.
- **Notificações:** tabela `notifications` (uma linha por destinatário), helpers em `src/utils/notifications.ts` (`notifyUser`/`notifyHouse`, best-effort), actions em `src/actions/notifications.ts` e sino em `src/components/notifications/notifications-bell.tsx` (cabeçalho). Destinatário = "o outro lado" da ação; lidas apagadas após 5 dias (limpeza lazy). Ver ADR-0009.
- **`Modal` (`src/components/ui/modal.tsx`):** renderiza via **portal no `body`** (`z-[100]`), **trava o scroll do documento**, **prende o foco (Tab/Shift+Tab) dentro da janela** enquanto aberto e fecha no **Esc**. Necessário porque o sino vive no header azul (`text-white`/`z-50`) — sem o portal o painel herdava a cor branca e a bottom nav ficava clicável por trás.

## 3. Supabase
- Três clientes em `src/utils/supabase/`: `server.ts` (`createClient`, regras Servers/RSC), `client.ts` (`createClient` browser), `admin.ts` (`createAdminClient` com service role, **server-only** — nunca importar de client component).
- Env vars só em `.env.local` (nomes exatos, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — é *publishable*, não `ANON_KEY` — `SUPABASE_SERVICE_ROLE_KEY`, `MASTER_PIN` que valida o cadastro de ADMIN em `actions/auth.ts`); `.env*` está no `.gitignore`, nada disso vive no repo.
- **Migrações SQL não estão no repo:** a pasta `supabase/` não existe e `supabase/*.sql` é gitignore. Mudanças de schema (ex: o script `supabase/migration_features.sql` citado em `PROJECT_STATUS.md`) são aplicadas manualmente no dashboard do Supabase — sem aplicá-las, features novas (imagens/sugestões/extensões) falham em runtime. Todos os scripts já documentados — colunas de imagem, `reward_suggestions`, flags `extension_*`, enum `task_status` com `NOT_DELIVERED`, tabela `notifications` (+ policy e publication) — **já foram aplicados** no banco.
- AUTH: sem e-mails reais — contas usam e-mails sintéticos `${username}@admin.casasync` (ADMIN) ou `${username}@dependente.casasync` (DEPENDENT), criadas já `email_confirm: true` via service role; login resolve o username → e-mail sintético e chama `signInWithPassword` pelo cliente do servidor (Server Actions em `src/actions/*.ts`, cada arquivo com `'use server'`).
- Padrão de autorização: SEMPRE derivada da sessão — nunca do input/cliente. O cliente service-role (`createAdminClient`, server-only) é usado para (a) **escritas que o RLS não cobre** (crédito/débito de pontos, criação de usuários) e (b) **leituras cross-role que o RLS não atende**. Nestas, o escopo é sempre explícito e derivado da sessão (`getSessionProfile().user.id`, casa ativa via `getActiveAdminHouse`, `houseId`), **nunca** de parâmetro público.
- **Controle de casa = membresia, não `owner_id`:** o ADMIN controla todas as casas com uma linha `house_members.role='ADMIN'` (criadas E co-geridas via PIN). `getAdminHouses`/`getActiveAdminHouse` e os `assertAdminCanManage` de tarefas/recompensas refletem isso; `houses.owner_id` identifica apenas o tutor/criador.
- Transições de status usam guard condicional (`.eq('status', ...)` / `.in('status', [...])`) para impedir crédito/débito/desaprovação duplicados; falha → rollback. Vale para `COMPLETED → APPROVED` (credita), `PENDING/IN_PROGRESS → APPROVED` (`adminCompleteTask`), `COMPLETED → PENDING` (`rejectCompletedTask`, limpa `completed_by/completed_at`) e `PENDING/IN_PROGRESS → NOT_DELIVERED` (`markTaskNotDelivered`, debita pontos).
- Realtime: tabelas precisam estar na publication `supabase_realtime`; listeners em `src/hooks/use-postgres-changes.ts` (canal + filter de `house_id` + RLS = isolamento multi-tenant). **Limite:** o browser não usa service role, então Realtime continua sujeito à RLS; leituras service-role não habilitam eventos ao vivo — o `router.refresh()` pós-ação cobre quem age, e policies de SELECT por membro habilitam o cross-role.
- **Realtime + RLS exige `setAuth`:** quando a sessão é restaurada de cookies/storage, o socket Realtime pode conectar como `anon` e o RLS descarta os eventos em silêncio (`SUBSCRIBED` mas zero entregas). O hook `usePostgresChanges` faz `await getSession()` + `await realtime.setAuth(access_token)` **antes** de assinar — nunca remover isso (corrige tarefas, recompensas, resgates, sugestões e notificações de uma vez).

## 4. Regras de negócio críticas
- `user_role`/`member_role` em caixa alta (`ADMIN`/`DEPENDENT`). Hierarquia: Admin → Casa(s) → Dependente(s) → Tarefas/Recompensas, isoladas por `house_id` (RLS) — multi-tenant.
- `ADMIN`: cria/gerencia casas e contas de dependentes (via `createDependent` em `actions/houses.ts`, service role + `email_confirm: true`; DEPENDENT **nunca se cadastra sozinho**), cria/aprova tarefas e recompensas.
- **Co-controle por PIN:** `houses.code` (único, gerado na criação) é o PIN de convite; outro ADMIN entra com `joinHouseByPin` (`actions/houses.ts`) e passa a controlar a casa junto do dono. A listagem `/dashboard/admin/houses` reflete casas criadas E co-geridas.
- Ciclo da tarefa: DEPENDENT conclui (`COMPLETED`); ADMIN **aprova** (credita pontos) ou **desaprova** (`rejectCompletedTask`: `COMPLETED → PENDING`, limpa a conclusão para o dependente refazer). ADMIN também pode concluir+creditar de uma vez (`adminCompleteTask`).
- **Tarefa "não entregue" (atrasada):** ADMIN marca via `markTaskNotDelivered` (`PENDING/IN_PROGRESS → NOT_DELIVERED`) e **debita** `tasks.points` do dependente (o saldo **pode ficar negativo**). Para o dependente o botão "Concluir" some, mas o pedido de adiamento continua. Aprovar um adiamento (`resolveTaskExtension`) ou alterar o prazo (`updateTask`) **devolve os pontos** e **zera** `tasks.points`: o status volta a ser o equivalente ao novo prazo (futuro → `PENDING`). Não há "Concluir e creditar" para `NOT_DELIVERED`. Ver ADR-0007.
- **Restaurar tarefa aprovada:** ADMIN reaproveita uma tarefa `APPROVED` via `restoreTask` (`APPROVED → PENDING`, guard `.eq('status','APPROVED')`) em vez de criar outra idêntica. Preserva os dados e **não altera os pontos já creditados**; limpa `completed_*`, zera as flags de adiamento e reinicia o prazo para **agora + 1 dia**. Ver ADR-0008.
- `DEPENDENT`: só vê as próprias tarefas/resgates. Enxerga **todos os tutores** da casa (todos os ADMIN membros, via `getHouseTutors` no dashboard) e o **criador** de cada tarefa (`tasks.created_by`, nome resolvido por `getProfileNames` e exibido nos cards de tarefas).
- Todo novo formulário com campo de senha deve marcar os `<Input>` com `suppressHydrationWarning` (extensões de gerenciador de senhas causam hydration mismatch — já ocorreu em 3 formulários).
- **Credenciais fora do estado React:** senha/`masterPin` NUNCA em `useState`/inputs controlados. Inputs ficam **uncontrolled** (só `name`), lidos via `FormData(event.currentTarget)` no submit e descartados; forms de sucesso chamam `reset()`. Server Actions de credencial não podem lançar exceção não tratada (o Next sobreporia overlay de dev com os argumentos) — use try/catch e retorne `ActionResult` (`ok:false` + mensagem genérica).

## 5. Skills ativas
- As skills vivem em `.agents/skills/`: **`grill-with-docs`** (questionar arquitetura/regras de negócio/DB antes de implementar) e **`teach`** (explicar padrões novos de Next.js/Supabase). Ative via ferramenta de skill quando aplicável.

## 6. Git
- Mensagens de commit em português, curtas (estilo do log: `remoção`, `edições e sugestões`). Commitar apenas quando solicitado.
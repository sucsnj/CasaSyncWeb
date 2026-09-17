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
- Docs complementares (commitados): `docs/schema.md` (snapshot do schema Supabase) e `docs/adr/` (decisões arquiteturais — o "porquê" de padrões como service role/credenciais/proxy).

## 3. Supabase
- Três clientes em `src/utils/supabase/`: `server.ts` (`createClient`, regras Servers/RSC), `client.ts` (`createClient` browser), `admin.ts` (`createAdminClient` com service role, **server-only** — nunca importar de client component).
- Env vars só em `.env.local` (nomes exatos, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — é *publishable*, não `ANON_KEY` — `SUPABASE_SERVICE_ROLE_KEY`, `MASTER_PIN` que valida o cadastro de ADMIN em `actions/auth.ts`); `.env*` está no `.gitignore`, nada disso vive no repo.
- **Migrações SQL não estão no repo:** a pasta `supabase/` não existe e `supabase/*.sql` é gitignore. Mudanças de schema (ex: o script `supabase/migration_features.sql` citado em `PROJECT_STATUS.md`) são aplicadas manualmente no dashboard do Supabase — sem aplicá-las, features novas (imagens/sugestões/extensões) falham em runtime.
- AUTH: sem e-mails reais — contas usam e-mails sintéticos `${username}@admin.casasync` (ADMIN) ou `${username}@dependente.casasync` (DEPENDENT), criadas já `email_confirm: true` via service role; login resolve o username → e-mail sintético e chama `signInWithPassword` pelo cliente do servidor (Server Actions em `src/actions/*.ts`, cada arquivo com `'use server'`).
- Padrão de autorização: SEMPRE derivada da sessão (cliente autenticado + RLS). O cliente service-role é usado apenas para escritas que o RLS do usuário não cobre (crédito/débito de pontos, criação de usuários) e validação de posse (`houses.owner_id`). Transições de status (ex: `COMPLETED → APPROVED`) usam guard `.eq('status', ...)` para impedir crédito duplicado; falha → rollback.
- Realtime: tabelas precisam estar na publication `supabase_realtime`; listeners em `src/hooks/use-postgres-changes.ts` (canal + filter de `house_id` + RLS = isolamento multi-tenant).

## 4. Regras de negócio críticas
- `user_role`/`member_role` em caixa alta (`ADMIN`/`DEPENDENT`). Hierarquia: Admin → Casa(s) → Dependente(s) → Tarefas/Recompensas, isoladas por `house_id` (RLS) — multi-tenant.
- `ADMIN`: cria/gerencia casas e contas de dependentes (via `createDependent` em `actions/houses.ts`, service role + `email_confirm: true`; DEPENDENT **nunca se cadastra sozinho**), cria/aprova tarefas e recompensas.
- `DEPENDENT`: só vê as próprias tarefas/resgates.
- Todo novo formulário com campo de senha deve marcar os `<Input>` com `suppressHydrationWarning` (extensões de gerenciador de senhas causam hydration mismatch — já ocorreu em 3 formulários).
- **Credenciais fora do estado React:** senha/`masterPin` NUNCA em `useState`/inputs controlados. Inputs ficam **uncontrolled** (só `name`), lidos via `FormData(event.currentTarget)` no submit e descartados; forms de sucesso chamam `reset()`. Server Actions de credencial não podem lançar exceção não tratada (o Next sobreporia overlay de dev com os argumentos) — use try/catch e retorne `ActionResult` (`ok:false` + mensagem genérica).

## 5. Skills ativas
- As skills vivem em `.agents/skills/`: **`grill-with-docs`** (questionar arquitetura/regras de negócio/DB antes de implementar) e **`teach`** (explicar padrões novos de Next.js/Supabase). Ative via ferramenta de skill quando aplicável.

## 6. Git
- Mensagens de commit em português, curtas (estilo do log: `remoção`, `edições e sugestões`). Commitar apenas quando solicitado.
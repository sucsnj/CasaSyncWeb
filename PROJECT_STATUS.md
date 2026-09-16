# CasaSync Web — PROJECT STATUS

## Etapa 1 — Infraestrutura Inicial (concluída)

### Funcionalidades implementadas
- Scaffold do projeto Next.js 16.3.5 (App Router, TypeScript strict, Tailwind CSS v4) em `casasync2`.
- Dependências do Supabase instaladas: `@supabase/supabase-js` e `@supabase/ssr`.

### Arquivos / rotas criados
- `.env.local` — placeholders `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (preencher com as chaves reais).
- `utils/supabase/server.ts` — `createClient()` servidor (cookies async do App Router).
- `utils/supabase/client.ts` — `createClient()` browser.
- `utils/supabase/middleware.ts` — `updateSession()`: renova sessão e protege rotas autenticadas (redireciona não autenticados para `/login`).
- `proxy.ts` (raiz) — exporta `proxy` (Next.js 16 substitui `middleware.ts`, descontinuado) com matcher que exclui assets estáticos.
- `types/database.ts` — tipos das tabelas `profiles`, `houses`, `house_members`, `tasks`, `rewards`, `reward_redemptions` + enums (`member_role`, `task_status`, `redemption_status`) + helpers `Tables<T>` / `Enums<T>`.
- `AGENTS.md` — diretrizes do projeto (stack, regras de negócio, protocolos do agente).
- `PROJECT_STATUS.md` — este arquivo.

### Decisões arquiteturais / pontos de atenção
- **`proxy.ts` no lugar de `middleware.ts`:** Next.js 16.3.5 descontinuou `middleware.ts` e o renomeou para `proxy.ts` (mesma API, export renomeado). Build valida: `ƒ Proxy (Middleware)`.
- `.env.local` ignorado pelo git (base do scaffold).
- Atualmente NÃO existem rotas `/login` e `/auth` — o `updateSession` já redireciona para `/login`, então criar essas rotas é necessário antes do fluxo de auth funcionar em produção.
- O tipo `Database` em `types/database.ts` é uma representação manual; sincronizar com o schema real do Supabase (gerar via `supabase gen types`) quando o banco for criado.
- Enums atuais estão em bom caminho, mas o arquivo oficial decide o `user_role` (`ADMIN`/`DEPENDENT`) — ainda não modelado no `types/database.ts`.

### Próxima etapa
1. Preencher `.env.local` com as chaves reais do projeto Supabase.
2. Criar o schema no Supabase (tabelas, RLS, enums `user_role`) e sincronizar `types/database.ts`.
3. Página `/login` (autenticação) + fluxo `/auth/callback` para o Supabase Auth.
4. Autenticação de cadastro do ADMIN / criação de conta de `DEPENDENT` pelo ADMIN.
5. Página inicial do dashboard (`ADMIN` vs `DEPENDENT`, isolamento por `house_id`).
# Mission: Segurança das chamadas de banco Supabase no CasaSync Web

## Why
O usuário desenvolve o CasaSync Web (Next.js + Supabase, multi-tenant por casa) e precisa dominar por que o projeto escreve o acesso ao banco de uma forma específica — cliente SSR via `utils/supabase/server.ts` e RLS no Postgres — para conseguir implementar as próximas etapas (tarefas e recompensas) de forma segura, sem vazar dados entre casas.

## Success looks like
- Explicar por que usamos `utils/supabase/server.ts` em vez de `createClient` espalhado nas páginas, citando cookies da sessão, key publishable e SRP (service role key server-only).
- Explicar como a RLS impede que um Dependente da Casa A veja Tarefas da Casa B mesmo manipulando IDs no navegador.
- Escrever uma Server Action de busca de tarefas limpa e segura que deriva autorização da sessão, não do input do cliente.

## Constraints
- Projeto com Next.js App Router, TypeScript strict, Supabase Auth/Pg + RLS.
- Regra adotada: operações de servidor via `utils/supabase/server.ts`; nunca expor `SUPABASE_SERVICE_ROLE_KEY` ao client-side.
- Aprendizado em português (PT-BR).
- A tabela `tasks` ainda não existe (Etapa 4); exemplos usam schema hipotético alinhado ao padrão do projeto.

## Out of scope
- Configuração do painel Supabase (provedores OAuth, Site URL).
- Tema de Realtime/websockets.
- Estratégia de cache do Next.js além do necessário para Server Actions.
- Migração de `getUser()` → `getClaims()` (só anotado como evolução, não aprofundado).
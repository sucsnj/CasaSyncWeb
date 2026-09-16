# Segurança de chamadas de banco Supabase — Resources

## Knowledge

- [Supabase Docs: Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
  Fonte primária definitiva: helper functions `auth.uid()`/`auth.jwt()`, nota sobre `user_metadata` ser editável pelo cliente, `service_role` × RLS, dica de performance `(select auth.uid())`. Use sempre antes de afirmar algo sobre políticas.
- [Supabase: Creating a client for SSR (framework Next.js)](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs)
  Explica por que o cliente SSR precisa de cookies adapter (`getAll`/`setAll`), o papel do Proxy no refresh do token, e por que o cliente do servidor deve ser criado por request. Anota a mudança `getSession()` → `getClaims()`.
- [GitHub supabase/ssr: `src/createServerClient.ts`](https://github.com/supabase/ssr/blob/main/src/createServerClient.ts)
  Docstring oficial dos autores do pacote: avisos de "random logouts", proibição de compartilhar cliente entre requests, `setAll` opcional em Server Components (contanto que o Proxy refresque sessão).
- [Next.js docs (local): Server Actions and Mutations](`node_modules/next/dist/docs/01-app/02-guides/server-actions.md`)
  Fonte do "Treat every action as an untrusted entry point", checagem CSRF, e o exemplo seguro "derive identity from the session, look up by ownership".
- [Supabase Docs: manual do banco — PostgreSQL Row Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
  Mesma página da primeira entrada; Ênfase: RLS é aplicada a todo acesso normal, independente do caminho do app.
- [GuardLayer: Supabase multi-tenant RLS — isolating tenant data](https://www.guardlayer.io/blog/supabase-multi-tenant-rls)
  Padrão seguro de policy multi-tenant: subquery de membership SEMPRE escopada por `(select auth.uid())`; app_metadata vs user_metadata; por que testar autenticado e não pelo SQL editor.
- [PTKD Journal: Is supabase.auth.uid() safe for RLS checks?](https://ptkd.com/journal/is-supabase-auth-uid-safe-for-rls-checks)
  Detalha o pipeline PostgREST (verificação de assinatura do JWT → GUC `request.jwt.claim.sub` → `auth.uid()`); garante que o valor nunca é client-asserted; explica `null = user_id` virar 200 vazio.

## Wisdom (Communities)

- [Supabase Discord](https://discord.gg/supabase)
  Canais #database e #auth; ótimo para revisar políticas RLS reais (multi-tenancy) por pessoas que já quebraram multi-tenant em produção.
- [r/Supabase](https://www.reddit.com/r/Supabase/)
  Discussão de casos reais de isolamento de tenant e armadilhas de `security definer`.

## Gaps

- Documentação oficial ainda não cobre explicitamente a escolha "cliente server via helper único" como padrão para multi-tenant; a justificativa está distribuída entre a página de SSR e a docstring do pacote. Coletar em um só lugar é parte do valor da lição 0001.
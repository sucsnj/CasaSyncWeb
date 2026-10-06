# ADR-0004: Proxy em vez de middleware (Next.js 16)

**Status:** aceito · **Data:** refatoração para `src/`

## Contexto
Next.js 16 substituiu o Middleware por Proxy: o arquivo de interceptação deve estar ao lado de `src/app` e exportar `proxy`.

## Decisão
- Proteção de rotas em `src/proxy.ts` (`export const proxy` + `config.matcher`).
- Lógica de sessão/role em `src/utils/supabase/middleware.ts` (`updateSession`), chamada pelo proxy.
- Código de app migrado para `src/` com alias `@/* → ./src/*`; rotas `/login` e `/register` em route group `(auth)`.

## Consequências
- Build mostra `ƒ Proxy` (Middleware) — é o esperado; não tentar voltar para `middleware.ts`.
- `next.config.ts` usa `module.exports` E `export default` (legado com `allowedDevOrigins`) — não "consertar".
- **O proxy roda em tudo, não só na navegação:** o matcher não exclui nada de RSC, então ele também roda nos GETs RSC da navegação client-side, nos prefetch dos itens da nav e nos POST das Server Actions. Por isso o `SELECT user_role` é guardado por `needsRole` — a role só é lida nas 4 decisões que realmente redirecionam (raiz, rotas públicas e as duas rotas de dashboard). Não é atalho de autorização: nesses 4 ramos a leitura continua exatamente igual. Emenda (Tier 1 de latência).
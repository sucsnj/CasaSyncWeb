# ADR-0030: Cache Components + PPR — validação incremental, `/tasks` e `/rewards` primeiro

**Status:** aceito • **Data:** 2026

## Contexto
`force-dynamic` obrigava o servidor a re-renderizar tudo a cada navegação:
esture uma conexão por clique, RSC payload completo, e o shell nunca pintava
antes da resposta. Cache Components (Next 16, `cacheComponents: true`) substitui
`dynamic`/`fetchCache`/`revalidate` por Partial Prerendering: toda rota gera um
shell estático na build e o dinamismo streama atrás de `<Suspense>`.

## Decisão
- **`cacheComponents: true`** em `next.config.ts` — nas **duas** exportações
  (`module.exports` para o CJS legado e `export default` para o tipado TS). O
  flag fica nos dois por causa do padrão híbrido intencional do projeto
  (`module.exports` sobrescreve `export default`).
- **Adoção incremental** (fluxo oficial do Next): `@next-codemod` marcou
  `export const instant = false` em todas as páginas/layouts — elas continuam
  funcionando, PPR habilitado, apenas com a validação de navegação instantânea
  **adiada**.
- **Instant validation removida apenas de `/tasks` e `/rewards`** (e dos layouts
  `src/app/layout.tsx` e `src/app/(app)/layout.tsx`) — essas duas rotas buildam
  para PPR e são o alvo da adoção por enquanto. As demais continuam opt-out
  (`/achievements`, `/chest`, dashboards, login, `/abrir-anexo`).
- `dynamic = 'force-dynamic'` removido de todas as rotas (config incompatível
  com `cacheComponents`).

## Consequências
- Build OK com todas as 18 rotas como Partial Prerender — o shell estático
  paints na hora no primeiro acesso/navegação, conteúdo streama atrás de
  `loading.tsx`/Suspense.
- **Não validado em produção ainda** — a validação de navegação instantânea
  acontece no dev overlay (e pelo `next build` para prerender); o usuário deve
  confirmar ao navegar entre `/tasks`/`/rewards` no dev que o overlay não acusa
  insights para essas duas rotas.
- Consumidores de `instant = false` remanescentes ficam para uma nova rodada de
  adoção.

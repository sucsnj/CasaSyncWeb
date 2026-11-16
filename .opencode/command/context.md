---
description: Entrypoint de contexto — essencial para tarefas que exigem profundidade (opcional: foco em $ARGUMENTS). Use antes de codar.
---

# Contexto — CasaSync Web

**Você recebeu apenas o essencial.** Este arquivo não substitui o código-fonte, `AGENTS.md` nem `docs/` — serve de mapa. Para precisão, abra o documento ou o arquivo-fonte em questão. Se não estiver aqui ou em `AGENTS.md`/`docs/`, não suponha: leia o arquivo ou pergunte.

## Produto

Gamificação familiar multi-tenant: **ADMIN** cria casas e gerencia dependentes; tarefas geram pontos; recompensas gastam pontos; o **PIN da casa** (`houses.code`) protege troca de casa e alteração manual de saldo.

## Stack
Next.js 16 (App Router em `src/`, `proxy.ts` no lugar de middleware) + React 19 + Tailwind 4 + shadcn/ui + Supabase (Auth/Postgres/Realtime/Storage) + `@tanstack/react-query` com cache persistido em IndexedDB por tenant (ver ADR-0029).

## Regras inegociáveis
- **Verificação antes de entregar:** `npm run lint` → `npm run typecheck` → `npm run build`. Sem teste automatizado — o guard é esse trio + uso manual.
- **`next.config.ts` usa `module.exports` híbrido com `export default`** — não "corrigir".
- **Server Actions de credenciais não podem lançar exceção** — `try/catch` retornando `ActionResult { ok, error? }`.
- **Senhas/PIN nunca em `useState`/controlled inputs;** use `name` + `FormData` e `<Input suppressHydrationWarning>`.
- **Imagens do Storage são `<img>`** por decisão; não usar `next/image`.
- **Cache do app = IndexedDB via TanStack Persist** (`src/lib/query/*`, chaves por tenant). Escopo **nunca** vem do cliente — é derivado da sessão (ver ADR-0006). Não amplie `shouldDehydrateQuery`: `shell`, `houses` (PIN), `comunicados`, `punishments`, `settings` ficam fora do disco de propósito.
- **Navegação = invalidação de query**, não `router.refresh()`. PATCH incremental quando o Realtime entregar a linha; `invalidateQueries` para o resto.
- **`router.refresh()` / `window.reload()` são exceção** (ex.: privilégios RSC em `/dashboard/**`).
- **Service Worker** (`public/sw.js`): cache-first só para assets estáveis; GETs em `/api/` e payloads RSC vão direto à rede; bump de `CACHE_NAME` ao mexer no SW.

## Quando precisar de mais profundidade, leia:
- **`docs/adr/0029-*.md`** — decisão de cache, shell client-side, não ativação de Cache Components.
- **`docs/architecture.md`** — fluxo de requisições, clientes Supabase, cache/`loading.tsx`, multi-tenant.
- **`docs/schema.md`** — snapshot do schema Supabase.
- **`docs/business-rules.md`** — regras de negócio tarefa/recompensa/castigo.
- **`docs/glossary.md`** — termos do domínio.
- **`PROJECT_STATUS.md`** — o que está pendente ou planejado.
- **`AGENTS.md`** — convenções centrais (encoding, autenticação, SW, pathname ativo).

## Roteiro de conversa
1. Entenda o escopo do que está sendo pedido (ou peça esclarecimento).
2. Localize os arquivos-fonte a alterar — este contexto não substitui leitura.
3. Siga o padrão do projeto (Server Action → bundle → query cache no cliente; Realtime → invalidação).

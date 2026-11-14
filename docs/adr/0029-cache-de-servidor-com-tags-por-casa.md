# ADR-0029: Cache de servidor com tags por casa (`unstable_cache`)

**Status:** aceito • **Data:** 2026

## Contexto
As quatro rotas (`/tasks`, `/rewards`, `/achievements`, `/chest`) são
`force-dynamic` e cada navegação refazia **todas** as leituras no servidor
(6–9 round-trips ADMIN, 9–15 DEPENDENT, somando layout + página + ação).
`React.cache` apenas deduplica dentro de um request. Nada era compartilhado
entre requests e nada era invalidado de forma seletiva (só `revalidatePath`,
que purga o Router/RSC cache, **não** o Data Cache — `unstable_cache` precisa
ser invalidado por tag).

## Decisão
- **Leituras puras extraídas** para `src/utils/data-cache.ts` (server-only, sem
  `'use server'`), envelopadas com `unstable_cache` com **tags por casa**
  (`tasks:{houseId}`, `rewards:{houseId}`, `chest:{houseId}`,
  `house-settings:{houseId}`, `house-members:{houseId}`,
  `storage:chest:{houseId}`). Sem TTL, exceto `storage:chest` (`revalidate: 300`
  — anexos entram no storage pelas actions sem invalidar a contagem).
- Dois níveis: `unstable_cache` (cross-request, Data Cache) + `React.cache`
  (dedupe no request). Nenhum `cookies()`/`headers()` dentro dos escopos —
  apenas `houseId` como argumento serializável; service-role por dentro
  (ADR-0006). Valores cacheados são POJOs JSON-serializáveis.
- **Invalidação por `updateTag()`** (read-your-writes) nas Server Actions
  **sempre** `updateTag` de dentro de ações — `revalidateTag(tag)` de 1
  argumento é erro de tipo no Next 16; `revalidateTag(tag, 'max')` só serve a
  Route Handlers (serve stale). Matriz completa no código:
  `dataTags` em `src/utils/data-cache.ts`; todo write de `tasks` (12 paths),
  `rewards` (8), `chest`/`chest_items` (create/update/delete + backfill de
  `file_size`), `house_settings` (as 2 actions de escrita) e
  `house_members`/`profiles` (create/join/createDependent/expel/delete) →
  tags correspondentes. `deleteChestItem` também expira `tasks:{houseId}`
  (detacha os espelhos). `deleteHouse`/`expelMember`/`deleteDependentAccount`
  expiram `rewards`/`chest`/`house-settings`/`house-members`/`tasks`.
- **Achievements ficam de fora** (2 queries; caminho de escrita é frágil —
  progresso nasce de `after()`/`registerLoginDay` sem ação caller). O shell
  (nav, sino, punição, comunicados, perfil) **permanece RSC** fora do cache.
- `revalidatePath` atual **mantido** como higiene de Router/RSC cache; ele não
  invalida o Data Cache — a consistência do cache depende exclusivamente das
  tags.

## Consequências
- Navegações e refetches do React Query passam a bater no Data Cache da casa
  (compartilhado entre todos os membros da casa): leituras ausentes em troca
  de escritas sempre tagueadas. `/rewards` economiza ~8 round-trips no ADMIN e
  ~6 no dependente; `/tasks` ~3–5; `/chest` ~2 + ~170ms de storage;
  `house-settings` deixa de ir ao banco a cada request.
- **Escritas fora de ações não invalidam** (edição direta no banco, SQL manual,
  webhooks): dado permanece até a próxima escrita legítima (sem TTL). Toda
  escrita nova **deve** chamar `updateTag`. Exceção aceita e documentada:
  `storage:chest` com TTL 300s.
- Efeito combinado com ADR-0028/F4: navegação instantânea continua limitada
  pelo RSC `force-dynamic` refazer as leituras (agora do cache) — o ganho é de
  latência de DB, não de bytes do payload.
- `.next/cache` persiste as entradas localmente entre builds — caches "quentes"
  sobrevivem a rebuilds (não é bug; é a semântica do Data Cache).

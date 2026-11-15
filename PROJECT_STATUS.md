# Estado do Projeto — CasaSync Web

## Status Atual
- **Foco:** Plano "local-first" entregue (F0 → F1 → F3 → F4 + Opção A concluída e validada).
- **Tarefas Pendentes:** Nenhuma no momento.

## Cache Components & PPR (ADR-0030), entregue (não validado em dev overlay)
- `cacheComponents: true` (ambas exportações em `next.config.ts`) + remoção de `force-dynamic` em 11 rotas + codemod `cache-components-instant-false` (rotas não-migradas opt-out).
- build ✅ 18 rotas Partial Prerender · **`/tasks` e `/rewards` sem opt-out de validação**; demais rotas com `instant = false`.
- **`instant = false` remanescente**: dashboards, chest, achievements, abrir-anexo, login — remover por fases.
- **Validação pendente pelo usuário**: navegar `/tasks` ↔ `/rewards` no `next dev` e confirmar que o overlay não acusa insights nessas rotas.

## Opção A — cache de servidor (ADR-0029), entregue
- `src/utils/data-cache.ts`: leituras puras com tags por casa (`tasks`, `rewards`, `chest`, `house-settings`, `house-members`, `storage:chest`); **TTL de fallback de 300s (SWR) em todas** — `updateTag` expira na hora; o TTL só limita escrita invisível a ~5 min. Achievements fora (de propósito); shell RSC fora.
- Invalidação via helper único `invalidateHouseCache(houseId, ...escopos)` — uma linha por action, sem arrays de tags soltos. Regra escrita no `AGENTS.md` ("revalidatePath NÃO invalida o Data Cache").
- `updateTag()` em todos os paths de escrita mapeados (tasks 12 · rewards 8 · chest 3 mutações + backfill + detach-tasks · settings 2 · houses 16 tags distribuídas em 7 actions, cobrindo exclusões de casa/membro/conta que apagam `rewards`/`chest`/`house-members`/`tasks`).
- `/rewards` ADMIN não re-lê mais `house_members`/`profiles` (duplicação removida); storage do baú sai do caminho crítico (cache 300s); itens espelho do baú em `/tasks` via leitura cacheada tag `chest:{hid}`.
- **Persistência do cache do cliente** (`src/lib/persist-cache.ts`): IndexedDB `casasync-rq-v1`, `staleTime = gcTime = 5min`, `maxAge` 5 min; só as 4 telas persistem; sign-out apaga cache + blob.
- **Limitação reconhecida:** escrita fora de action (SQL manual, edição direta no banco) não invalida o Data Cache — ver ADR-0029.
- Validação: `lint` 0 warnings · `tsc` ✅ · `build` ✅ · `check:encoding` ✅ · smoke autenticado 4 rotas × 2 papéis (200 + hidratação + escopo do dependente) ✅; `.next/cache/fetch-cache` confirmado como store ativo.
- Nada commitado.
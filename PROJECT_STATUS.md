# Estado do Projeto — CasaSync Web

## Status Atual
- **Foco:** Plano "local-first" entregue (F0 → F1 → F3 → F4 + Opção A concluída e validada).
- **Tarefas Pendentes:** Nenhuma no momento.

## Opção A — cache de servidor (ADR-0029), entregue
- `src/utils/data-cache.ts`: leituras puras com tags por casa (`tasks`, `rewards`, `chest`, `house-settings`, `house-members`, `storage:chest`); **TTL de fallback de 300s (SWR) em todas** — `updateTag` expira na hora; o TTL só limita escrita invisível a ~5 min. Achievements fora (de propósito); shell RSC fora.
- Invalidação via helper único `invalidateHouseCache(houseId, ...escopos)` — uma linha por action, sem arrays de tags soltos. Regra escrita no `AGENTS.md` ("revalidatePath NÃO invalida o Data Cache").
- `updateTag()` em todos os paths de escrita mapeados (tasks 12 · rewards 8 · chest 3 mutações + backfill + detach-tasks · settings 2 · houses 16 tags distribuídas em 7 actions, cobrindo exclusões de casa/membro/conta que apagam `rewards`/`chest`/`house-members`/`tasks`).
- `/rewards` ADMIN não re-lê mais `house_members`/`profiles` (duplicação removida); storage do baú sai do caminho crítico (cache 300s); itens espelho do baú em `/tasks` via leitura cacheada tag `chest:{hid}`.
- **Limitação reconhecida:** escrita fora de action (SQL manual, edição direta no banco) não invalida o Data Cache — ver ADR-0029.
- Validação: `lint` 0 warnings · `tsc` ✅ · `build` ✅ · `check:encoding` ✅ · smoke autenticado 4 rotas × 2 papéis (200 + hidratação + escopo do dependente) ✅; `.next/cache/fetch-cache` confirmado como store ativo.
- Nada commitado.
# ADR-0016: Conquistas autônomas — estatísticas, métricas novas e concessão manual

**Status:** aceito · **Data:** gamificação (continuação do ADR-0015)

## Contexto

O ADR-0015 entregou o progresso de conquistas **no caminho do crédito**: a cada
aprovação, `registerAchievementProgress` somava `amount` diretamente em
`dependent_achievements.current_progress`. Isso funciona para `EARNED_POINTS`
(volátil), mas limita o conjunto de métricas e torna o progresso **emotivo** —
não há de onde derivar um streak de acesso, uma contagem de tarefas reprovadas
ou um total de recompensas resgatadas.

A evolução pedida:
1. **Contadores absolutos por dependente** que evoluem sozinhos e de onde o
   progresso de conquistas é **derivado** (estatísticas, não emoção).
2. Novas métricas de produto: tarefas aprovadas **e reprovadas**, recompensas
   resgatadas, sugestões aprovadas, dias de acesso e **dias seguidos** (streak).
3. Conquistas de **concessão manual** — o tutor decide ("mérito fora de regra"),
   como "ajudou o irmão na lição de casa".

Restrições herdadas (inalteradas): escritas via service role com autorização
derivada da sessão (ADR-0001/0006); Realtime sob RLS (ADR-0010); valores
calculados em runtime; best-effort nunca derruba a ação principal.

## Decisão

### Nova tabela `dependent_stats` (uma linha por dependente+casa, RLS sem policies)
Colunas: `profile_id` (PK, FK→profiles `on delete cascade`), `house_id`
(FK→houses `on delete cascade`), `tasks_approved_count`,
`tasks_rejected_count`, `rewards_claimed_count`,
`custom_rewards_approved_count`, `app_login_days_count`, `streak_login_days`
(no `RED`/`DATE_PART` nativo — streak é **contado no app**, não calculado no
banco), `last_login_day date` e `updated_at`. **Sem policies de cliente** — as
escritas/leituras são exclusivamente service-role com escopo de sessão (mesmo
padrão de leituras cross-role, ADR-0006) — e **fora da publication Realtime**
(preserva `dependent_achievements` como superfície de UI via `usePostgresChanges`).
Contadores iniciam em **0** (sem backfill) — progresso pré-estatísticas é
preservado pela regra de `Math.max` abaixo.

### Nova união de métricas (8) + rótulos em `src/utils/achievements.ts`
`TASKS_APPROVED`, `TASKS_REJECTED`, `REWARDS_CLAIMED`,
`CUSTOM_REWARDS_APPROVED`, `APP_LOGIN_DAYS`, `STREAK_LOGIN_DAYS`,
`EARNED_POINTS` (volátil) e `MANUAL` (concessão). `COMPLETED_TASKS` foi
**renomeada para `TASKS_APPROVED`** — SQL de migração em `PROJECT_STATUS.md`. O
mapa métrica→coluna vive em `src/utils/dependent-stats.ts` (módulo puro: valores
não transmitíveis saem de arquivos `'use server'` — mesmo bug documentado no
ADR-0015/`ACHIEVEMENT_ICONS`).

### Dispatcher `registerAchievementProgress` (mesma assinatura — sem paralelo v2)
- `MANUAL` → no-op (não é métrica automática).
- `EARNED_POINTS` → `syncAchievementProgress` com **soma incremental** (o valor
  corrente da aprovação, já com `task_decay` — mesmo crédito do ADR-0007).
- Demais → `incrementDependentStat` (lazy insert ou update atômico com guard
  `.eq(column, valor lido)` + 1 retry) e depois `evaluateAchievements`.

### `evaluateAchievements` (deriva o progresso do contador absoluto)
Por conquista da casa que mede a métrica (contador lido fresco de
`dependent_stats`):
- **Repetível:** `progresso do ciclo = contador − (nível−1) × objetivo` (o
  excedente já consumido por ciclos anteriores são os `level−1` resgates).
- **Única:** `progresso = min(contador, objetivo)`.
- `progress = existing ? max(existing.current_progress, raw) : raw` — progresso
  histórico de antes das estatísticas **nunca diminui**.
- `unlocked_at` só é definido quando cruza o objetivo e ainda não está.

**Limitação documentada (aceita):** no **cap** (nível travado no `max_level`), o
rollover do resgate subtrai o objetivo uma vez por ciclo, mas a fórmula usa o
nível (travado) → os ciclos consumidos no cap são **subestimados**, desbloqueando
a conquista um pouco antes. A **recompensa paga não muda** (é sempre a do nível
travado); corrigir exigiria desacoplar count-consumido de level.

### Injeções (todas best-effort, no caminho da ação primária)
- `approveTask` / `adminCompleteTask`: `TASKS_APPROVED` (1) + `EARNED_POINTS`
  (valor corrente) — inalteradas em comportamento, só o nome da métrica.
- `rejectCompletedTask`: `TASKS_REJECTED` (1) — **nova**.
- `approveRedemption`: `REWARDS_CLAIMED` (1) — **nova** (conta na **aprovação**,
  não no pedido).
- `resolveRewardSuggestion` (aprovado): `CUSTOM_REWARDS_APPROVED` (1) — **nova**.
- `registerLoginDay`: conta **uma vez por dia**, dia em **America/Recife**
  (`Intl` en-CA com `timeZone: 'America/Recife'`); streak = ontem ? `+1` : 1,
  idempotente por `last_login_day`; avaliado `APP_LOGIN_DAYS` +
  `STREAK_LOGIN_DAYS`. Disparado best-effort nos renders dependentes (layout
  `/dashboard/dependent` + branches dependentes de `/tasks`, `/rewards`,
  `/achievements`).

### `grantAchievementProgress(achievementId, profileId, amount=1)`
Só ADMIN da casa ativa; a conquista precisa ser da casa **e** `metric_type =
'MANUAL'`; o alvo precisa ser `house_members.role='DEPENDENT'`; `amount` inteiro
1–1000. Concede via `syncAchievementProgress` (lazy insert/atomic update). UX:
botão "+1" por dependente no card da conquista MANUAL em
`/achievements` (ADMIN).

### Limpeza
`expelMember` / `deleteDependentAccount` / `deleteHouse` removem também as linhas
de `dependent_stats` (dependente+casa, dependente, casa) no fluxo explícito —
mesmo padrão das demais tabelas.

## Consequências
- **SQL obrigatório antes do deploy:** tabela `dependent_stats` + migração
  `UPDATE achievements SET metric_type='TASKS_APPROVED' WHERE
  metric_type='COMPLETED_TASKS'` (bloco no topo do `PROJECT_STATUS.md`). Sem a
  tabela, métricas contadas não registram progresso (best-effort silencioso);
  sem a migração, conquistas antigas ficam com métrica morta.
- `EARNED_POINTS` segue sem coluna: é a única métrica **absoluta-incremental**,
  não derivável de um contador único da casa (depende do valor corrente na
  aprovação).
- Limite já registrado no ADR-0015/topo do `PROJECT_STATUS.md` (decay): trocar
  settings **entre** débito e devolução de `NOT_DELIVERED` recalcula pelo
  setting novo — fora de escopo.
- UI dependente segue a mesma superfície (`dependent_achievements` + Realtime),
  sem depender de `dependent_stats` no browser.
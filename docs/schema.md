# Schema do Supabase (snapshot manual)

Fonte de verdade do código: `src/types/database.ts` (espelho manual). Para regenerar a partir do banco real quando o CLI estiver linkado ao projeto:

```bash
npx supabase gen types typescript --project-id <project-ref> > src/types/database.generated.ts
```

As migrações SQL **não ficam commitadas** (`supabase/*.sql` é gitignore; sem pasta `supabase/` no repo). Mudanças de schema são aplicadas manualmente no dashboard do Supabase — ver `AGENTS.md` §3. **Todos os scripts documentados aqui, no `PROJECT_STATUS.md` e nos ADRs (colunas de imagem — incl. `rewards.active` e `notifications.image_url`/`message_id` da mensagem rápida —, `reward_suggestions`, flags `extension_*`, enum `NOT_DELIVERED`, tabela `notifications` + policy + publication, bucket `casasync-media`, `tasks.decay_started_at`, as 3 colunas das conquistas, a tabela `house_settings` + policy, as tabelas `achievements`/`dependent_achievements` e a tabela `dependent_stats` + migração `COMPLETED_TASKS→TASKS_APPROVED`) já foram aplicados no projeto atual — **nada está pendente no banco.**

## Tabelas

### profiles
| coluna | tipo | notas |
|---|---|---|
| id | uuid PK | FK → auth.users (one-to-one) |
| username | text | único, lowercase (cadastro/login por username) |
| full_name | text | |
| avatar_url | text | |
| user_role | `user_role` | `ADMIN` \| `DEPENDENT` |
| points | int | saldo ao vivo (default 0) |
| created_at / updated_at | timestamptz | |

### houses
| coluna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| name | text | |
| code | text | PIN único gerado na criação (convite/co-controle; exibido/copiável nos cards) |
| owner_id | uuid FK → profiles | tutor/criador; **não** define controle (ver `house_members.role='ADMIN'`) |
| image_url | text | |
| created_at / updated_at | timestamptz | |

### house_members
| coluna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| house_id | uuid FK → houses | |
| profile_id | uuid FK → profiles | |
| role | `member_role` | `ADMIN` \| `DEPENDENT`; `ADMIN` = dono **ou** co-gerente (entrou via PIN) |
| created_at / updated_at | timestamptz | |

### tasks
| coluna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| house_id | uuid FK → houses | isolamento multi-tenant (RLS + realtime filter) |
| title / description | text | description nullable |
| points | int | |
| status | `task_status` | `PENDING` \| `IN_PROGRESS` \| `COMPLETED` \| `APPROVED` \| `NOT_DELIVERED` (penalidade de atraso) |
| assigned_to | uuid FK → profiles | nullable; `''` normalizado para nul em `actions/tasks.ts` |
| created_by | uuid FK → profiles | |
| completed_by / completed_at | uuid / timestamptz | nullable |
| due_date | timestamptz | SLA (`src/utils/task-sla.ts`); **sempre gravado com fuso** — o cliente envia o instante ISO via `datetimeLocalToIso` e o servidor (`normalizeDueDate`) rejeita string naive (seria lida como UTC e deslocaria o prazo) |
| image_url | text | |
| extension_requested | bool | pedido de adiamento |
| extension_reason | text | justificativa obrigatória |
| decay_started_at | timestamptz | nullable; ponto de partida do relógio do **decaimento** (criação ou última edição; null em tarefas antigas → fallback `created_at`). **Aplicado no Supabase** (SQL no topo do `PROJECT_STATUS.md`) |
| created_at / updated_at | timestamptz | |

### rewards
| coluna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| house_id | uuid FK → houses | |
| active | bool | `true` (default) = ativa; `false` = desativada pelo ADMIN (indisponível, nunca excluída; guard em `requestRedemption`) |
| title / description | text | |
| points_cost | int | originalmente `cost` → renomeada |
| emoji | text | |
| image_url | text | |
| created_by | uuid FK → profiles | |
| created_at / updated_at | timestamptz | |

### reward_redemptions
| coluna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| house_id | uuid FK → houses | |
| reward_id | uuid FK → rewards | |
| profile_id | uuid FK → profiles | |
| status | `redemption_status` | `PENDING` \| `APPROVED` \| `REJECTED` |
| approved_by | uuid | nullable |
| points_cost | int | snapshot do custo no resgate |
| resolved_at | timestamptz | |
| created_at / updated_at | timestamptz | |

### reward_suggestions
| coluna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| house_id | uuid FK → houses | |
| profile_id | uuid FK → profiles | dependente que sugeriu |
| title / description | text | |
| points_cost | int | nullable (`?? 5` ao aprovar) |
| image_url | text | |
| status | text | `PENDING` \| `APPROVED` \| `REJECTED` |
| created_at / updated_at | timestamptz | |

### notifications
| coluna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| house_id | uuid FK → houses | isolamento multi-tenant (realtime filter) |
| recipient_id | uuid FK → profiles | quem recebe (indexado junto de `read_at`) |
| actor_id | uuid FK → profiles | nullable; quem gerou a ação |
| type | text | valores definidos em `NotificationType` (`src/types/notifications.ts`); **sem CHECK no banco** |
| title | text | resumo curto |
| body | text | mensagem legível |
| link | text | nullable; deep link (`/tasks`, `/rewards`) |
| image_url | text | nullable; imagem opcional (usada na mensagem rápida `QUICK_MESSAGE`) |
| message_id | uuid | nullable; agrupa as cópias de um mesmo envio de mensagem rápida (indexado) |
| read_at | timestamptz | nullable; `null` = não lida |
| created_at | timestamptz | |

Notificações são registradas **best-effort** pelas actions (falha não derruba o fluxo
principal). Destinatário = "o outro lado" da ação (dependente para ações do ADMIN;
todos os ADMINs membros para ações do dependente). O delete é do próprio usuário e
as **lidas são apagadas após 5 dias** por limpeza lazy (`getMyNotifications`), sem
pg_cron.

### house_settings
| coluna | tipo | notas |
|---|---|---|
| house_id | uuid FK → houses (PK) | casa dona da configuração; `on delete cascade` |
| key | text (PK) | `reward_pricing` \| `quick_message` \| `task_sla` \| `extension_rules` \| `notification_retention` \| `task_decay` (`HouseSettingsKey` em `src/utils/settings.ts`) |
| value | jsonb | objeto de configuração; campos ausentes caem no default via `mergeSettings` |
| updated_by | uuid FK → profiles | nullable; ADMIN que salvou por último |
| updated_at | timestamptz | default `now()` |

Configuração por casa, escrita **exclusivamente** pela Server Action `updateHouseSettings`
(`src/actions/settings.ts`, service role + autorização ADMIN por membresia) e lida pelos
getters cached em `src/utils/house-settings.ts` (sem Realtime: a propagação usa
`router.refresh()` pós-ação). Sem linha = defaults (`DEFAULT_REWARD_PRICING` /
`DEFAULT_QUICK_MESSAGE` / `DEFAULT_TASK_SLA` / `DEFAULT_EXTENSION_RULES` /
`DEFAULT_NOTIFICATION_RETENTION` / `DEFAULT_TASK_DECAY`). **Sem publication Realtime.**

Chaves e efeitos:
- `reward_pricing`: `enabled`, `noIncreaseMax`, `midMax`, `midRate`, `highRate`, `minBump` — encarecimento automático em `approveRedemption` (`nextRewardCost`). Defaults: ≤25 não encarece; 26–200 +3%; >200 +2%; piso +1 pt.
- `quick_message`: `maxChars` (100), `maxImageMb` (5), `capacity` (2, limite de envio), `readRetentionDays` (5, **retenção por tempo**: assim que ao menos um admin lê, apaga o grupo inteiro após X dias; mensagens nunca lidas ficam armazenadas; regra antiga "2 lidas → apaga a mais antiga" removida).
- `task_sla`: `defaultDueDays` (1, prazo "agora + N dias" no form/restauro) e `dueSoonHours` (4, chip "Prazo próximo" quando faltam menos de N horas para o prazo — limiar absoluto, independente da duração; 0 desliga).
- `extension_rules`: `dayOptions` ([1,3], botões "Aprovar (+N dias)"; `resolveTaskExtension` rejeita dias fora da lista).
- `notification_retention`: `readRetentionDays` (5, lidas comuns apagadas por casa da notificação, excluindo `QUICK_MESSAGE`).
- `task_decay`: `enabled` (true), `periodHours` (24), `pointsPerPeriod` (1) — decaimento de pontos de tarefas. A cada `periodHours` completas desde o **ponto de partida do relógio** — `tasks.decay_started_at` (criação ou última edição; fallback `created_at`) — a tarefa perde `pointsPerPeriod` (janela capada no `due_date` — após o vencimento a perda não cresce —, piso 0); `tasks.points` é a base intocada e o valor corrente é calculado por `getTaskCurrentPoints` (`src/utils/task-decay.ts`), usado no crédito da aprovação e no débito de `NOT_DELIVERED`. Adiamentos não reiniciam o relógio; `restoreTask` reinicia (ver topo do `PROJECT_STATUS.md`).

### achievements
| coluna | tipo | notas |
|---|---|---|
| id | uuid PK | default `gen_random_uuid()` |
| house_id | uuid FK → houses | isolamento por casa; `on delete cascade` |
| title | text | ≤100 chars |
| description | text | nullable |
| icon | text | slug de `ACHIEVEMENT_ICONS`; substituído por `image_url` quando presente |
| image_url | text | pasta `achievements/` no bucket; substitui o ícone nos cards |
| metric_type | text | união de 8 em `AchievementMetricType` (`src/utils/achievements.ts`): `TASKS_APPROVED` \| `TASKS_REJECTED` \| `REWARDS_CLAIMED` \| `CUSTOM_REWARDS_APPROVED` \| `APP_LOGIN_DAYS` \| `STREAK_LOGIN_DAYS` \| `EARNED_POINTS` \| `MANUAL`. `COMPLETED_TASKS` foi migrada p/ `TASKS_APPROVED` |
| reward_points | int | base da recompensa por nível |
| target_count | int | objetivo por ciclo (default 1) |
| is_repeatable | bool | repetível sobe de nível até o cap; única resgata só no nível 1 |
| is_secret | bool | card oculto "Conquista secreta" até desbloquear |
| max_level | int | cap p/ repetíveis (1–1000, default 10; server clampa p/ 1 em únicas) |
| level_multiplier | numeric | default 1; recompensa do nível N = `reward_points × N × mult` |
| created_by | uuid FK → profiles | `on delete set null` |
| created_at / updated_at | timestamptz | |

RLS: SELECT por membro (policy `achievements_select_members`); na publication Realtime. Escritas via service role (escopo da sessão).

### dependent_achievements
| coluna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| house_id | uuid FK → houses | |
| achievement_id | uuid FK → achievements | `on delete cascade` (excluir conquista apaga o progresso) |
| profile_id | uuid FK → profiles | dependente |
| level | int | default 1; sobe a cada resgate de repetível |
| current_progress | int | default 0; derivado das estatísticas (não capado no banco — a UI capa a barra) |
| unlocked_at | timestamptz | nullable; `null` = não desbloqueada |
| created_at / updated_at | timestamptz | |

Uma linha por (conquista, dependente). RLS: SELECT por membro (policy `dependent_achievements_select_members`); na publication Realtime (superfície de UI do progresso). Escritas via service role.

### dependent_stats
| coluna | tipo | notas |
|---|---|---|
| profile_id | uuid PK FK → profiles | `on delete cascade` |
| house_id | uuid FK → houses | `on delete cascade` |
| tasks_approved_count | int | default 0 |
| tasks_rejected_count | int | default 0 |
| rewards_claimed_count | int | default 0 |
| custom_rewards_approved_count | int | default 0 |
| app_login_days_count | int | default 0 |
| streak_login_days | int | default 0 |
| last_login_day | date | idempotência do login diário (America/Recife) |
| updated_at | timestamptz | |

Uma linha por dependente+casa; contadores iniciados em **0** (sem backfill). Os contadores alimentam o progresso das métricas (exceto `EARNED_POINTS`/`MANUAL`); mapa métrica→coluna em `src/utils/dependent-stats.ts`. **RLS sem policies de cliente** (leituras/escritas service-role) e **fora da publication Realtime** (a UI segue por `dependent_achievements`).

## Enums
- `user_role` = `ADMIN` \| `DEPENDENT`
- `member_role` = `ADMIN` \| `DEPENDENT`
- `task_status` = `PENDING` \| `IN_PROGRESS` \| `COMPLETED` \| `APPROVED` \| `NOT_DELIVERED`
- `redemption_status` = `PENDING` \| `APPROVED` \| `REJECTED`

Valores em caixa alta (regra de negócio). `NOT_DELIVERED` foi adicionado ao enum
existente (`alter type public.task_status add value 'NOT_DELIVERED';`) — **já
aplicado** no Supabase.

## Fora do snap dos types (não verificável no código)
- **Storage:** bucket público `casasync-media` com pastas avatars/houses/rewards/tasks/suggestions/messages. Leituras públicas + insert para `authenticated` no bucket (policies `casasync_media_select_public` / `casasync_media_insert_authenticated` — criadas com o bucket, que **não existia** e causava `Bucket not found` em uploads. Ver `PROJECT_STATUS.md`).
- **RLS:** cada tabela isola por `house_id`/owner; dependentes só leem as próprias linhas. O app faz as **leituras cross-role** (casas/membros/atribuições e tarefas/recompensas) via **service-role** com escopo derivado da sessão (ver ADR-0006), então a RLS é exigida principalmente pelo **Realtime** (o browser não usa service role) e por leituras via cliente autenticado. Policies úteis: SELECT em `houses` e `house_members` para quem é membro `ADMIN` da mesma casa (SQL em `PROJECT_STATUS.md`); SELECT em `notifications` para `recipient_id = auth.uid()` (necessária ao Realtime do sino); SELECT em `house_settings` para membros da mesma casa (SQL em `PROJECT_STATUS.md` — settings são lidas pelo app via service role, a policy atende leituras futuras via cliente autenticado); SELECT em `achievements`/`dependent_achievements` para membros da mesma casa (SQL em `PROJECT_STATUS.md`).
- **Realtime:** tabelas precisam estar na publication `supabase_realtime` (houses, house_members, profiles, tasks, rewards, reward_redemptions, reward_suggestions, notifications, **achievements, dependent_achievements**) — sem isso, os listeners em `src/hooks/use-postgres-changes.ts` não recebem eventos. **`dependent_stats` fica FORA da publication** (a UI segue por `dependent_achievements`). Além disso, o hook chama `getSession()` + `realtime.setAuth(access_token)` antes de assinar: com sessão restaurada de cookies o socket conectava como `anon` e o RLS descartava os eventos em silêncio.
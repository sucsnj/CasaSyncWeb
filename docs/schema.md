# Schema do Supabase (snapshot manual)

Fonte de verdade do código: `src/types/database.ts` (espelho manual). Para regenerar a partir do banco real quando o CLI estiver linkado ao projeto:

```bash
npx supabase gen types typescript --project-id <project-ref> > src/types/database.generated.ts
```

As migrações SQL **não ficam commitadas** (`supabase/*.sql` é gitignore; sem pasta `supabase/` no repo). Mudanças de schema são aplicadas manualmente no dashboard do Supabase — ver `AGENTS.md` §3. **Todos os scripts documentados aqui, no `PROJECT_STATUS.md` e nos ADRs (colunas de imagem — incl. `rewards.active` e `notifications.image_url`/`message_id` da mensagem rápida —, `reward_suggestions`, flags `extension_*`, enum `NOT_DELIVERED`, tabela `notifications` + policy + publication e o bucket `casasync-media`) já foram aplicados no projeto atual — nada está pendente.**

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
| key | text (PK) | `reward_pricing` \| `quick_message` (`HouseSettingsKey` em `src/utils/settings.ts`) |
| value | jsonb | objeto de configuração; campos ausentes caem no default via `mergeSettings` |
| updated_by | uuid FK → profiles | nullable; ADMIN que salvou por último |
| updated_at | timestamptz | default `now()` |

Configuração por casa, escrita **exclusivamente** pela Server Action `updateHouseSettings`
(`src/actions/settings.ts`, service role + autorização ADMIN por membresia) e lida pelos
getters cached em `src/utils/house-settings.ts` (sem Realtime: a propagação usa
`router.refresh()` pós-ação). Sem linha = defaults (`DEFAULT_REWARD_PRICING` /
`DEFAULT_QUICK_MESSAGE`). **Sem publication Realtime.**

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
- **RLS:** cada tabela isola por `house_id`/owner; dependentes só leem as próprias linhas. O app faz as **leituras cross-role** (casas/membros/atribuições e tarefas/recompensas) via **service-role** com escopo derivado da sessão (ver ADR-0006), então a RLS é exigida principalmente pelo **Realtime** (o browser não usa service role) e por leituras via cliente autenticado. Policies úteis: SELECT em `houses` e `house_members` para quem é membro `ADMIN` da mesma casa (SQL em `PROJECT_STATUS.md`); SELECT em `notifications` para `recipient_id = auth.uid()` (necessária ao Realtime do sino); SELECT em `house_settings` para membros da mesma casa (SQL em `PROJECT_STATUS.md` — settings são lidas pelo app via service role, a policy atende leituras futuras via cliente autenticado).
- **Realtime:** tabelas precisam estar na publication `supabase_realtime` (houses, house_members, profiles, tasks, rewards, reward_redemptions, reward_suggestions, notifications) — sem isso, os listeners em `src/hooks/use-postgres-changes.ts` não recebem eventos. Além disso, o hook chama `getSession()` + `realtime.setAuth(access_token)` antes de assinar: com sessão restaurada de cookies o socket conectava como `anon` e o RLS descartava os eventos em silêncio.
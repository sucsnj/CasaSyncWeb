# Schema do Supabase (snapshot manual)

Fonte de verdade do código: `src/types/database.ts` (espelho manual). Para regenerar a partir do banco real quando o CLI estiver linkado ao projeto:

```bash
npx supabase gen types typescript --project-id <project-ref> > src/types/database.generated.ts
```

As migrações SQL **não ficam commitadas** (`supabase/*.sql` é gitignore; sem pasta `supabase/` no repo). Mudanças de schema são aplicadas manualmente no dashboard do Supabase — ver `AGENTS.md` §3.

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
| code | text | código único gerado (convite) |
| owner_id | uuid FK → profiles | posse validada via service role |
| image_url | text | |
| created_at / updated_at | timestamptz | |

### house_members
| coluna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| house_id | uuid FK → houses | |
| profile_id | uuid FK → profiles | |
| role | `member_role` | `ADMIN` \| `DEPENDENT` |
| created_at / updated_at | timestamptz | |

### tasks
| coluna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| house_id | uuid FK → houses | isolamento multi-tenant (RLS + realtime filter) |
| title / description | text | description nullable |
| points | int | |
| status | `task_status` | `PENDING` \| `IN_PROGRESS` \| `COMPLETED` \| `APPROVED` |
| assigned_to | uuid FK → profiles | nullable; `''` normalizado para nul em `actions/tasks.ts` |
| created_by | uuid FK → profiles | |
| completed_by / completed_at | uuid / timestamptz | nullable |
| due_date | timestamptz | SLA (`src/utils/task-sla.ts`) |
| image_url | text | |
| extension_requested | bool | pedido de adiamento |
| extension_reason | text | justificativa obrigatória |
| created_at / updated_at | timestamptz | |

### rewards
| coluna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| house_id | uuid FK → houses | |
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

## Enums
- `user_role` = `ADMIN` \| `DEPENDENT`
- `member_role` = `ADMIN` \| `DEPENDENT`
- `task_status` = `PENDING` \| `IN_PROGRESS` \| `COMPLETED` \| `APPROVED`
- `redemption_status` = `PENDING` \| `APPROVED` \| `REJECTED`

Valores em caixa alta (regra de negócio).

## Fora do snap dos types (não verificável no código)
- **Storage:** bucket público `casasync-media` com pastas avatars/houses/rewards/tasks/suggestions e policies de leitura pública.
- **RLS:** cada tabela isola por `house_id`/owner; dependentes só leem as próprias linhas. Exigido pelo app em runtime — sem policies, as queries do usuário autenticado falham vazias.
- **Realtime:** tabelas precisam estar na publication `supabase_realtime` (houses, house_members, profiles, tasks, rewards, reward_redemptions, reward_suggestions) — sem isso, os listeners em `src/hooks/use-postgres-changes.ts` não recebem eventos.
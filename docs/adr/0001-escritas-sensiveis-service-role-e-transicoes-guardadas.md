# ADR-0001: Escritas sensíveis via service role com autorização por sessão + transições guardadas

**Status:** aceito · **Data:** histórico (Etapa 3, ver `PROJECT_STATUS.md`)

## Contexto
O RLS do Supabase protege leituras/rotas por sessão, mas crédito/débito de pontos (aprovação de tarefa/resgate) e criação de usuários não são cobertos por policies do usuário autenticado. Duplicidade de crédito em requisições concorrentes era um risco real.

## Decisão
- Autorização **sempre** derivada da sessão (cliente autenticado + RLS); nunca apenas do input/cliente.
- O cliente service-role (`src/utils/supabase/admin.ts`, server-only) é usado para **escritas que o RLS não cobre** — criação de usuários, crédito/débito de `profiles.points` e validação de controle (`house_members.role='ADMIN'`, ver ADR-0006) — e, também, para **leituras cross-role** (ADR-0006).
- Transições de status usam guard condicional: `update().eq('status', esperado)` — se falhar (já aprovado), rollback ao estado anterior. Impede crédito/débito duplicado.

## Consequências
- `approveTask` (`COMPLETED → APPROVED`), `approveRedemption` (`PENDING → APPROVED`), `adminCompleteTask` (`PENDING/IN_PROGRESS → APPROVED`), `rejectCompletedTask` (`COMPLETED → PENDING`, sem crédito) e `markTaskNotDelivered` (`PENDING/IN_PROGRESS → NOT_DELIVERED`, com débito; ver ADR-0007) seguem o padrão. Falha na creditação/débito reverte o status.
- Todo novo caminho de escrita sensível deve copiar: sessão → RLS → service-role com guard + rollback.
# ADR-0001: Escritas sensíveis via service role com autorização por sessão + transições guardadas

**Status:** aceito · **Data:** histórico (Etapa 3, ver `PROJECT_STATUS.md`)

## Contexto
O RLS do Supabase protege leituras/rotas por sessão, mas crédito/débito de pontos (aprovação de tarefa/resgate) e criação de usuários não são cobertos por policies do usuário autenticado. Duplicidade de crédito em requisições concorrentes era um risco real.

## Decisão
- Autorização **sempre** derivada da sessão (cliente autenticado + RLS); nunca apenas do input/cliente.
- O cliente service-role (`src/utils/supabase/admin.ts`, server-only) é usado **somente** para escritas que o RLS não cobre: criação de usuários, crédito/débito de `profiles.points` e validação de posse (`houses.owner_id`).
- Transições de status usam guard condicional: `update().eq('status', esperado)` — se falhar (já aprovado), rollback ao estado anterior. Impede crédito/débito duplicado.

## Consequências
- `approveTask` (`COMPLETED → APPROVED`) e `approveRedemption` (`PENDING → APPROVED`) seguem o padrão. Falha na creditação reverte o status.
- Todo novo caminho de escrita sensível deve copiar: sessão → RLS → service-role com guard + rollback.
-- Status "em espera" (ON_HOLD) — tarefa pausada pelo ADMIN.
--
-- Aplicar manualmente no dashboard do Supabase (SQL Editor → New query → Run).
-- O app depende deste valor: sem ele, `setTaskOnHold` falha ao gravar
-- `tasks.status = 'ON_HOLD'` (enum invalido) e a seção "Em espera" fica vazia.
--
-- Observação: `ALTER TYPE ... ADD VALUE` não pode ser usado na MESMA
-- transação em que o valor novo é lido/escrito — rode este script sozinho
-- (o SQL Editor já executa cada query fora de transação).

alter type public.task_status add value if not exists 'ON_HOLD';

-- Confirmação (opcional):
-- select unnest(enum_range(null::public.task_status)) as status;

-- Notificações: a pausa avisa o dependente com o tipo novo 'TASK_ON_HOLD'.
-- `notifications.type` é `text` sem CHECK no schema atual, então nada é
-- necessário. Se existir CHECK de valores permitidos, inclua os dois tipos
-- novos (TASK_ON_HOLD e o já existente TASK_RESTORED) ao recrear a constraint:
--
--   alter table public.notifications drop constraint if exists notifications_type_check;
--   alter table public.notifications
--     add constraint notifications_type_check check (type in (
--       'TASK_CREATED', 'TASK_COMPLETED', 'TASK_APPROVED', 'TASK_REJECTED',
--       'TASK_RESTORED', 'TASK_ON_HOLD', 'TASK_NOT_DELIVERED',
--       'TASK_EXTENSION_REQUESTED', 'TASK_EXTENSION_RESOLVED',
--       'REWARD_CREATED', 'REDEMPTION_REQUESTED', 'REDEMPTION_APPROVED',
--       'REDEMPTION_REJECTED', 'SUGGESTION_CREATED', 'SUGGESTION_RESOLVED',
--       'QUICK_MESSAGE', 'PENALTY', 'ACHIEVEMENT_UNLOCKED'
--     ));
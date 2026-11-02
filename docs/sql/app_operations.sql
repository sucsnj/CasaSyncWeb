-- Idempotencia de mutacoes (fila offline) — tabela de operacoes.
--
-- Aplicar manualmente no dashboard do Supabase (SQL Editor -> New query -> Run).
-- O app so toca nesta tabela quando uma acao recebe `operationId` (fila offline
-- da Fase 1). Sem `operationId`, as Server Actions rodam exatamente como antes.
--
-- Regras:
-- - `operation_id` e a chave de idempotencia gerada no cliente (UUID).
-- - `result` guarda o ActionResult da PRIMEIRA execucao; replay devolve o mesmo
--   resultado sem reexecutar efeitos colaterais (push/notificacao/pontos).
-- - `result = null` + `created_at` recente = operacao em andamento.
-- - RLS habilitada e SEM policies: somente a service role acessa.
--
-- Se voce ja aplicou uma versao anterior desta tabela, rode este arquivo de
-- novo: os comandos abaixo sao idempotentes (IF NOT EXISTS / OR REPLACE).

create table if not exists public.app_operations (
  operation_id uuid primary key,
  kind text not null,
  actor_id uuid references public.profiles(id) on delete cascade,
  house_id uuid references public.houses(id) on delete cascade,
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists app_operations_created_idx
  on public.app_operations (created_at);

create index if not exists app_operations_actor_idx
  on public.app_operations (actor_id, created_at desc);

alter table public.app_operations enable row level security;

-- Nenhuma policy: anon/authenticated nao leem nem escrevem. A service role
-- (bypass de RLS) e a unica via.
revoke all on public.app_operations from anon, authenticated;

-- Limpeza de operacoes antigas (o app tambem faz um DELETE direto a cada N
-- execucoes; a funcao serve para cron/manual).
create or replace function public.purge_app_operations()
returns integer
language sql
security definer
set search_path = public
as $$
  with removed as (
    delete from public.app_operations
    where created_at < now() - interval '7 days'
    returning 1
  )
  select count(*)::integer from removed;
$$;

revoke all on function public.purge_app_operations() from public, anon, authenticated;

-- Confirmacao (opcional):
-- select count(*) from public.app_operations;
-- select public.purge_app_operations();

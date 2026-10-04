-- CASTIGO DO DEPENDENTE — indicador que o ADMIN aplica e o dependente vê no
-- cabeçalho (ícone de triângulo). Aplicar manualmente no dashboard do Supabase
-- (SQL editor). Registro da feature: `PROJECT_STATUS.md` (seção "Castigo do
-- dependente") e ADR-0020 (`docs/adr/0020-castigo-do-dependente.md`).
--
-- O castigo NÃO altera nenhuma regra do app: não mexe em pontos, tarefas,
-- recompensas ou conquistas. É apenas um aviso que o ADMIN escreve.

-- 1) Tabela: UM castigo ativo por dependente (`unique (profile_id)`) — aplicar
--    de novo SOBREPÕE o antigo (upsert na action). Descrição e duração são
--    OPCIONAIS: sem duração (`expires_at` null) o castigo só sai quando o ADMIN
--    remove manualmente; com duração, `expires_at` = now + N dias é gravado pela
--    action e a leitura trata vencido como "sem castigo" (limpeza lazy).
create table if not exists public.dependent_punishments (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  -- Descrição livre, opcional (1–500 caracteres com `.trim()` — validado também
  -- na action, fail closed). Vazio/nula = castigo sem texto.
  description text check (
    description is null
    or char_length(btrim(description)) between 1 and 500
  ),
  -- Duração em dias, opcional (1–365). NULL = sem duração (persiste até o
  -- ADMIN remover).
  duration_days int check (duration_days is null or duration_days between 1 and 365),
  -- Derivado de `duration_days` pela action (now + N dias). É o campo comparado
  -- na leitura para decidir se o castigo ainda vale.
  expires_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id)
);
create index if not exists dependent_punishments_house_idx
  on public.dependent_punishments (house_id);
create index if not exists dependent_punishments_expires_idx
  on public.dependent_punishments (expires_at);

-- 2) RLS SEM policies: a leitura (dependente) e as escritas (ADMIN) são
--    service-role com escopo derivado da sessão (ADR-0006). A exibição é por
--    render server-side — o módulo é SEM Realtime, mesma premissa dos
--    comunicados (ADR-0017): o dependente vê o castigo ao atualizar a tela ou
--    navegar. NÃO incluir em `supabase_realtime`.
alter table public.dependent_punishments enable row level security;
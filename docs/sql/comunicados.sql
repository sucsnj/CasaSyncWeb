-- COMUNICADOS — avisos da casa que o dependente precisa confirmar.
-- Aplicar manualmente no dashboard do Supabase (SQL editor), na ordem abaixo.
-- Registro da feature: `PROJECT_STATUS.md` (seção "Comunicados").

-- 1) Tabela principal: comunicado é definido pelo ADMIN e tem uma agenda de
--    repetição (quantas confirmações por dependente, período em dias, dias da
--    semana e horário). `published = true` é o que os dependentes enxergam.
create table if not exists public.comunicados (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  title text not null check (char_length(title) between 1 and 120),
  description text not null check (char_length(description) between 1 and 500),
  published boolean not null default false,
  repeats_total int not null default 1 check (repeats_total between 1 and 100),
  repeat_interval_days int not null default 0 check (repeat_interval_days between 0 and 365),
  repeat_weekdays int[] not null default '{0,1,2,3,4,5,6}',
  repeat_time time not null default '08:00:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists comunicados_house_idx on public.comunicados (house_id);
create index if not exists comunicados_published_house_idx on public.comunicados (published, house_id);

-- 2) Entregas por dependente: cada confirmação soma `delivered_count` e vira o
--    `last_confirmed_at` que agenda a próxima repetição (a roda do agendamento
--    é server-side, na próxima abertura — sem cron no projeto).
create table if not exists public.comunicado_deliveries (
  id uuid primary key default gen_random_uuid(),
  comunicado_id uuid not null references public.comunicados(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  house_id uuid not null references public.houses(id) on delete cascade,
  delivered_count int not null default 0 check (delivered_count >= 0),
  last_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (comunicado_id, profile_id)
);
create index if not exists comunicado_deliveries_house_idx on public.comunicado_deliveries (house_id);
create index if not exists comunicado_deliveries_profile_idx on public.comunicado_deliveries (profile_id);

-- 3) RLS: leituras client-side (Realtime dos ADMINs) via policy por membro;
--    escritas/leituras de negócio são service role (padrão ADR-0006).
alter table public.comunicados enable row level security;
alter table public.comunicado_deliveries enable row level security;

create policy "comunicados_select_members" on public.comunicados
  for select to authenticated
  using (exists (
    select 1 from public.house_members hm
    where hm.house_id = comunicados.house_id
      and hm.profile_id = auth.uid()
  ));

-- 4) Realtime SÓ de `comunicados`: o overlay do dependente reavalia a fila na
--    publicação/edição; as entregas não são publicadas (o servidor deriva).
alter publication supabase_realtime add table public.comunicados;
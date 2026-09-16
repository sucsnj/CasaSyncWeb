-- CasaSync — Migração: edição completa, imagens, SLA, sugestões e extensões.
-- Rode este script no SQL Editor do seu projeto Supabase.
-- Requerido para habilitar as features de runtime (uploads, sugestões, extensões).

-- 1) Colunas de imagem nas tabelas existentes
alter table public.houses add column if not exists image_url text;
alter table public.tasks add column if not exists image_url text;
alter table public.rewards add column if not exists image_url text;

-- 2) Pedido de adiamento de tarefa (dependente → admin)
alter table public.tasks add column if not exists extension_requested boolean not null default false;
alter table public.tasks add column if not exists extension_reason text;

-- 3) Sugestões de recompensa (dependente → admin)
create table if not exists public.reward_suggestions (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  points_cost int,
  image_url text,
  status text not null default 'PENDING',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Índice de leitura por casa (existe policy de SELECT para autenticados)
create index if not exists reward_suggestions_house_id_idx
  on public.reward_suggestions(house_id);

-- Trigger de updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists reward_suggestions_set_updated_at on public.reward_suggestions;
create trigger reward_suggestions_set_updated_at
  before update on public.reward_suggestions
  for each row execute function public.set_updated_at();

-- RLS: select para autenticados da casa; escritas ficam no service role
-- (server-only), seguindo o padrão do projeto.
alter table public.reward_suggestions enable row level security;

drop policy if exists "reward_suggestions_select" on public.reward_suggestions;
create policy "reward_suggestions_select"
  on public.reward_suggestions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.house_members hm
      where hm.house_id = reward_suggestions.house_id
        and hm.profile_id = auth.uid()
    )
  );

-- 4) Storage: bucket público para avatares/casas/recompensas/tarefas/sugestões
insert into storage.buckets (id, name, public)
values ('casasync-media', 'casasync-media', true)
on conflict (id) do nothing;

drop policy if exists "casasync-media-public-read" on storage.objects;
create policy "casasync-media-public-read"
  on storage.objects
  for select
  to public
  using (bucket_id = 'casasync-media');

drop policy if exists "casasync-media-insert" on storage.objects;
create policy "casasync-media-insert"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'casasync-media');

drop policy if exists "casasync-media-update" on storage.objects;
create policy "casasync-media-update"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'casasync-media');

drop policy if exists "casasync-media-delete" on storage.objects;
create policy "casasync-media-delete"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'casasync-media');

-- 5) Realtime: inclusão da tabela de sugestões na publication
alter publication supabase_realtime add table public.reward_suggestions;
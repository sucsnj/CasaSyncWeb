-- Push Subscriptions table for Web Push notifications
-- Execute no Supabase SQL Editor

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  house_id uuid not null references public.houses(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

create index if not exists push_subscriptions_house_idx
  on public.push_subscriptions (house_id);

alter table public.push_subscriptions enable row level security;

-- Usuário só vê/gerencia suas próprias subscriptions
create policy "push_subscriptions_select_own" on public.push_subscriptions
  for select to authenticated
  using (user_id = auth.uid());

create policy "push_subscriptions_insert_own" on public.push_subscriptions
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "push_subscriptions_delete_own" on public.push_subscriptions
  for delete to authenticated
  using (user_id = auth.uid());

-- Admin da casa pode ver subscriptions dos membros (para debug/envio)
create policy "push_subscriptions_select_admin" on public.push_subscriptions
  for select to authenticated
  using (exists (
    select 1 from public.house_members hm
    where hm.house_id = push_subscriptions.house_id
      and hm.profile_id = auth.uid()
      and hm.role = 'ADMIN'
  ));

-- Realtime para sync de subscriptions (opcional)
alter publication supabase_realtime add table public.push_subscriptions;
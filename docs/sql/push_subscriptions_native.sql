-- Migração para suportar push nativo (FCM) e web (VAPID) na mesma tabela.
alter table public.push_subscriptions
  add column if not exists provider text not null default 'WEB_PUSH';

alter table public.push_subscriptions
  add column if not exists token text;

alter table public.push_subscriptions
  alter column p256dh drop not null,
  alter column auth drop not null;

create unique index if not exists push_subscriptions_user_token_idx
  on public.push_subscriptions (user_id, token)
  where token is not null;
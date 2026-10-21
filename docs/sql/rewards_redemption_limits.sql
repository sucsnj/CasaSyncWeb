-- RECOMPENSAS — limitadores de resgate (diário e mensal).
-- Aplicar manualmente no dashboard do Supabase (SQL editor).
-- Registro da feature: `PROJECT_STATUS.md` (seção "Recompensas: limitadores").
--
-- `daily_limit` / `monthly_limit` = 0 significa **resgates ilimitados** (mesma
-- regra nos dois campos). A regra é a mesma usada pelas outras chaves de
-- `house_settings` (0 = desligado/sem limite).
--
-- O limite é POR DEPENDENTE e vale para o pedido de resgate
-- (`requestRedemption`): a contagem considera as entregas do dependente para
-- aquela recompensa, dentro da janela (dia/mês corrente no fuso da casa).
alter table public.rewards add column if not exists daily_limit int not null default 0;
alter table public.rewards add column if not exists monthly_limit int not null default 0;

-- Constraints: os limites não podem ser negativos (0 = ilimitado).
alter table public.rewards drop constraint if exists rewards_daily_limit_non_negative;
alter table public.rewards add constraint rewards_daily_limit_non_negative check (daily_limit >= 0);
alter table public.rewards drop constraint if exists rewards_monthly_limit_non_negative;
alter table public.rewards add constraint rewards_monthly_limit_non_negative check (monthly_limit >= 0);

-- Confirmação (opcional):
-- select daily_limit, monthly_limit, count(*) from public.rewards group by 1, 2;

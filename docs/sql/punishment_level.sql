-- Castigo do dependente: 2 níveis — 1 = aviso (triângulo amarelo), 2 = castigo
-- (triângulo vermelho). Rodar no SQL Editor do Supabase, antes do deploy.
--
-- Default 2 de propósito: as linhas JÁ gravadas são o castigo vigente (o
-- comportamento anterior), então elas continuam valendo sem backfill. O app
-- também envia o nível explicitamente ao aplicar/substituir.
--
-- O CHECK é a barreira no banco: a action valida o mesmo conjunto antes de
-- gravar, mas é aqui que a linha fica protegida de qualquer outro caminho.

alter table public.dependent_punishments
  add column if not exists level int not null default 2;

alter table public.dependent_punishments
  drop constraint if exists dependent_punishments_level_check;

alter table public.dependent_punishments
  add constraint dependent_punishments_level_check check (level in (1, 2));

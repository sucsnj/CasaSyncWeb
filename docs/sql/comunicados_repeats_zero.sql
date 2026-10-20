-- COMUNICADOS — `repeats_total = 0` = SEM LIMITE de confirmações.
-- Aplicar no SQL Editor do Supabase (depois do deploy do código, ou antes —
-- a leitura do 0 é feita pelo app e o banco precisa aceitar o valor).
--
-- A constraint original era `repeats_total between 1 and 100`; passa a aceitar
-- 0 (0 = o dependente recebe o aviso para sempre, até despublicar/excluir).
alter table public.comunicados drop constraint if exists comunicados_repeats_total_check;
alter table public.comunicados add constraint comunicados_repeats_total_check check (repeats_total between 0 and 100);

-- Confirmação: select unnest... (opcional)
-- select repeats_total, count(*) from public.comunicados group by repeats_total;

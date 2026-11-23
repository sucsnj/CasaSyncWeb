-- COMUNICADOS — confirmação por respostas (quiz).
-- Aplicar no SQL Editor do Supabase antes do deploy do código.

alter table public.comunicados
  add column if not exists confirmation_answers text[],
  add column if not exists confirmation_correct_index int,
  add column if not exists confirmation_wrong_points int not null default 0;

-- Garante que, quando houver respostas, o índice correto seja válido.
-- (Validação mais rígida fica na action; aqui só evita índice negativo.)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'comunicados_confirmation_correct_index_check'
  ) then
    alter table public.comunicados
      add constraint comunicados_confirmation_correct_index_check
      check (confirmation_correct_index is null or confirmation_correct_index >= 0);
  end if;
end
$$;

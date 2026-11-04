-- Anexo do baú em "espelho" na tarefa.
--
-- A tarefa passa a referenciar o `chest_items.id` em vez de copiar o objeto.
-- Com isso, editar/excluir o item no baú reflete na tarefa (e vice-versa não).
--
-- Rodar no SQL Editor do Supabase, ANTES do deploy.

alter table public.tasks
  add column if not exists attachment_chest_item_id uuid references public.chest_items(id) on delete set null;

create index if not exists tasks_attachment_chest_item_idx
  on public.tasks (attachment_chest_item_id)
  where attachment_chest_item_id is not null;
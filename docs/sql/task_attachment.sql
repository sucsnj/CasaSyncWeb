-- Anexo da tarefa (arquivo único por tarefa) — rodar no SQL Editor do Supabase.
--
-- O upload reaproveita a coluna `tasks.image_url` (que já guardava a imagem da
-- tarefa): a URL do anexo vai para lá, e estas duas colunas guardam o NOME
-- original do arquivo e o MIME, para o app escolher ícone/rótulo e validar.
-- Tarefa antiga (com `image_url` e sem `attachment_type`) continua sendo
-- tratada como imagem inline — o mesmo caminho de antes.
--
-- Migration nullable e sem backfill: nada quebra se rodar depois do deploy
-- (o app só passa a ler as colunas novas depois que elas existirem).

alter table public.tasks
  add column if not exists attachment_name text;

alter table public.tasks
  add column if not exists attachment_type text;

-- O anexo é sempre da casa (bucket público `casasync-media`, pasta `tasks/`),
-- então filtrar por casa é o índice natural de uma listagem futura.
create index if not exists tasks_house_attachment_idx
  on public.tasks (house_id)
  where attachment_type is not null;
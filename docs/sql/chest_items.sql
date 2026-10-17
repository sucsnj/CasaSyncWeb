-- Baú da casa — acervo de arquivos (imagem, vídeo, PDF ou página HTML) que o
-- ADMIN disponibiliza para os dependentes. Rodar no SQL Editor do Supabase,
-- ANTES do deploy (o app lê esta tabela na rota `/chest`).
--
-- Decisões (docs/adr/0024-bau-da-casa.md):
--   * o item é DA CASA (`house_id`), não do ADMIN — mesmo multi-tenant de
--     `tasks`/`rewards`/`achievements`, então o `deleteHouse` já limpa por FK;
--   * título é obrigatório e pode repetir (sem índice único): a busca é por
--     título, em memória;
--   * o arquivo é obrigatório — o baú é acervo de arquivo, e sem `file_url` o
--     item não teria nada para abrir;
--   * o MIME fica gravado porque o Supabase força `text/plain` em `text/html`:
--     o app precisa saber quando servir os bytes pela rota própria (com CSP
--     `sandbox`), em vez de mandar o browser para a URL pública.

create table if not exists public.chest_items (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 100),
  file_url text not null,
  file_name text,
  file_type text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Listagem da tela: filtrar por casa, mais recentes primeiro (a consulta da
-- rota faz `order('created_at', { ascending: false })`).
create index if not exists chest_items_house_created_idx
  on public.chest_items (house_id, created_at desc);

alter table public.chest_items enable row level security;

-- Leitura no client: só quem é membro da casa. As escritas são **sempre** por
-- service-role a partir das Server Actions (ADR-0001/ADR-0006) — não há policy
-- de INSERT/UPDATE/DELETE, então o browser não consegue escrever nem que o
-- RLS deixasse.
create policy "chest_items_select_members" on public.chest_items
  for select to authenticated
  using (exists (
    select 1 from public.house_members hm
    where hm.house_id = chest_items.house_id
      and hm.profile_id = auth.uid()
  ));

-- Realtime: o baú é catálogo, como a loja de recompensas — quem está na tela
-- precisa ver item novo, edição e exclusão sem F5. (O canal do browser continua
-- sujeito ao RLS, então é esta policy que habilita a entrega.)
alter publication supabase_realtime add table public.chest_items;
-- Adiciona `file_size` (bytes) em `chest_items` para evitar `storage.list`
-- ao montar o seletor "Usar material do baú" (ADR-0027, emenda).
--
-- Rodar no SQL Editor do Supabase, ANTES do deploy que usa a coluna.

alter table public.chest_items
  add column if not exists file_size integer;

-- Backfill best-effort não é possível via SQL (o tamanho vive no Storage).
-- Linhas antigas ficam com `file_size = null` ("tamanho indisponível") até
-- serem regravadas; opcionalmente rode um script de backfill via service-role.

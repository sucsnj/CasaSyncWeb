-- COMUNICADOS — repetição ancorada na ocorrência agendada.
-- Aplicar no SQL Editor do Supabase antes (ou junto) do deploy do código.
--
-- Antes, a próxima repetição era calculada a partir de `last_confirmed_at`
-- (instante real da digitação), então uma confirmação atrasada deslocava a
-- agenda para frente. Agora a âncora é `last_occurrence_at`: a ocorrência
-- agendada já tratada. Confirmações atrasadas NÃO deslocam a agenda e as
-- ocorrências perdidas são puladas.
--
-- `last_confirmed_at` continua sendo gravado, mas só como auditoria.
alter table public.comunicado_deliveries
  add column if not exists last_occurrence_at timestamptz;

-- Backfill das entregas antigas: sem isso, uma entrega já confirmada voltaria a
-- ser tratada como 1ª exibição. `last_confirmed_at` é a melhor aproximação da
-- ocorrência que foi tratada; a partir da próxima confirmação o app ancora no
-- slot agendado de verdade.
update public.comunicado_deliveries
set last_occurrence_at = last_confirmed_at
where last_occurrence_at is null
  and last_confirmed_at is not null;

-- Conferência (deve retornar 0 linhas):
-- select id from public.comunicado_deliveries
-- where last_occurrence_at is null and last_confirmed_at is not null;

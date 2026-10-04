-- LIMITE DE ADIAMENTOS POR TAREFA — contador de quantas vezes o prazo de uma
-- tarefa já foi esticado. Aplicar manualmente no dashboard do Supabase
-- (SQL Editor). Registro da feature: `PROJECT_STATUS.md` (seção "Limite de
-- adiamentos") e ADR-0022 (`docs/adr/0022-limite-de-adiamentos-por-tarefa.md`).
--
-- POR QUE UMA COLUNA: `extension_requested`/`extension_reason` são flags do
-- pedido ATUAL (limpas quando o pedido é resolvido), não histórico. Sem um
-- contador não existe como saber quantos adiamentos uma tarefa já recebeu.

-- 1) Contador por tarefa. `0` = nenhuma esticagem ainda.
--    A action `resolveTaskExtension` incrementa ao aprovar um adiamento; o
--    limite (`house_settings.extension_rules.maxExtensions`) é checado no
--    pedido do dependente (`requestTaskExtension`).
--    Tarefas já existentes nascem em 0: não há como saber quantos adiamentos
--    elas já tiveram, e inventar histórico seria pior do que recomeçar a
--    contagem (mesma honestidade do `extension_count` de uma linha nova).
alter table public.tasks
  add column if not exists extension_count int not null default 0;

-- 2) As leituras do app acotam o valor em 0 (o contador nunca diminui), então
--    um CHECK é só uma rede de segurança para escrita manual no SQL editor.
alter table public.tasks
  drop constraint if exists tasks_extension_count_non_negative;
alter table public.tasks
  add constraint tasks_extension_count_non_negative check (extension_count >= 0);

-- 3) Índice não é necessário: o contador é lido junto com a linha da tarefa
--    (`.select('..., extension_count')`), nunca por filtro. (Registro explícito
--    para não se criar um índice sem uso depois.)
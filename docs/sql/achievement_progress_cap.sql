-- Trava de progresso das conquistas: o `current_progress` nunca passa do
-- objetivo (`target_count`). Rodar no SQL Editor do Supabase.
--
-- O app já grava com teto (`capAchievementProgress`/`applyAchievementProgress`
-- em src/utils/achievements.ts), então este UPDATE é só a limpeza das linhas
-- GRAVADAS ANTES da regra: sem ele, um `dependent_achievements` com
-- `current_progress > target_count` continua exibindo o excedente até a próxima
-- ocorrência da métrica (o self-healing do app). O excedente é descartado de
-- propósito — a decisão de produto é que o ciclo seguinte exige o objetivo
-- inteiro de novo (ver ADR-0019).
--
-- Seguro para rodar: só toca linhas acima do objetivo (não tem como Affectar
-- `level`, `unlocked_at` nem `points` de ninguém). Nada aqui é destrutivo no
-- sentido de apagar dado de jogo — o que se ajusta é o contador do ciclo.

update public.dependent_achievements da
set current_progress = a.target_count,
    updated_at = now()
from public.achievements a
where a.id = da.achievement_id
  and da.current_progress > a.target_count;

-- Conferência (deve retornar 0 linhas):
-- select da.id, da.current_progress, a.target_count
-- from public.dependent_achievements da
-- join public.achievements a on a.id = da.achievement_id
-- where da.current_progress > a.target_count;
# ADR-0015: Conquistas gamificadas por casa

**Status:** aceito · **Data:** gamificação

## Contexto
O fluxo tarefas→pontos→recompensas já cobre o "dever" e o "gasto", mas não há
objetivos de longo prazo nem recompensa por marcos. Queremos que o ADMIN defina
**conquistas** (metas) por casa — completar N tarefas, ganhar N pontos em
aprovações — com um bônus em pontos **à parte** da tarefa, e que o dependente
acompanhe o progresso e **resgate** esse bônus ao desbloquear.

Restrições herdadas do projeto:
- Escritas sensíveis via service role; autorização sempre derivada da sessão (ADR-0001/0006).
- Multi-tenant por `house_id`; Realtime no browser roda sob RLS (ADR-0010).
- Progresso de pontos usa o **valor corrente** (com `task_decay`) no crédito (ADR-0007/topo do `PROJECT_STATUS.md`).
- Sem notificações novas por item — o 9º item do escopo atual (sino) já cobre os fluxos; decisão explícita abaixo.

## Decisão
- **Duas tabelas novas** (SQL manual no Supabase — sem migrações versionadas):
  - **`achievements`** — `house_id` (FK → houses, `on delete cascade`), `title`,
    `description`, `icon`, `metric_type`, `reward_points`, `target_count`,
    `is_repeatable`, `is_secret`, `created_by`, timestamps.
  - **`dependent_achievements`** — uma linha por (conquista, dependente):
    `house_id`, `achievement_id` (FK → achievements, `on delete cascade`),
    `profile_id` (FK → profiles, `on delete cascade`), `level`,
    `current_progress`, `unlocked_at`. O `level` sobe a cada resgate.
- **`metric_type`** = `COMPLETED_TASKS` | `EARNED_POINTS`. O progresso é
  registrado **apenas nas aprovações** (caminho do crédito): `registerAchievementProgress`
  é chamado em `approveTask` (dependente concluiu + ADMIN aprovou) e em
  `adminCompleteTask` (ADMIN conclui+credita) com `amount` = 1 por tarefa
  aprovada (`COMPLETED_TASKS`) ou o **valor corrente creditado** de pontos — já
  com `task_decay` — (`EARNED_POINTS`).
- **Registro best-effort e atômico:** try/catch (falha nunca derruba o crédito
  da aprovação); **lazy insert** para conquistas ainda sem linha; **update por
  linha com guard `.eq('current_progress', valor lido)` + 1 retry relendo** —
  duas aprovações concorrentes não perdem incremento. `current_progress` **não é
  capado no banco** (a UI capa a barra em 100%; permite rollover natural).
- **Resgate (`claimAchievementReward`)** — só DEPENDENT da própria casa; credita
  `reward_points` **direto em `profiles.points`** (mesmo ajuste simples de
  `approveTask`, sem serviço compartilhado). Guard anti-race no `unlocked_at`
  lido (repetíveis) ou `level == 1` (não repetíveis); rollback da linha se o
  crédito falhar.
  - **Repetível:** `level+1` e rollover `max(0, progress − target)`; `unlocked_at`
    volta a null → re-desbloqueia no próximo ciclo e pode resgatar de novo.
  - **Não repetível:** resgata **uma vez** no nível 1; depois vira chip
    "Concluída" (`level` 2 no banco) e o botão some.
- **Limpeza em cascata:** excluir uma conquista apaga o progresso (FK `on delete
  cascade`); `expelMember`/`deleteDependentAccount`/`deleteHouse`
  (`src/actions/houses.ts`) removem as linhas de `dependent_achievements` (e a
  `deleteHouse` remove as `achievements` da casa) no fluxo explícito de limpeza —
  sem depender de cascade.
- **Realtime + RLS:** o browser (ADMIN e DEPENDENT) assina `achievements` e
  `dependent_achievements` por `house_id` via `usePostgresChanges` (que faz
  `setAuth` — ADR-0010), exigindo as policies `*_select_members` (SELECT por
  membro da mesma casa) e a inclusão das duas tabelas na publication
  `supabase_realtime`. As ações e a rota leem por service role com escopo de
  sessão (mesmo padrão ADR-0006).
- **Conquista secreta (`is_secret`):** aparece **sempre** no card do dependente
  como "Conquista secreta" (sem título/descrição), revelando o conteúdo somente
  quando `dependent_achievements` tem linha para aquele dependent(e desbloqueou) —
  a "esposa não sabe do que se trata até desbloquear".
- **UI:** `/achievements` role-aware reutilizando o padrão de componentes
  separados (ADMIN CRUD + progresso por dependente; DEPENDENT metas), nav com
  ícone `Trophy` (ADMIN passa a 5 itens), e `achievement-icon.tsx` (12 slugs
  Lucide + fallback troféu).

## Decisões de escopo (aceitas)
- **Progresso conta apenas aprovações** — débitos de `NOT_DELIVERED`,
  devoluções e remoção de membros não decrementam o progresso. Simplicidade e
  previsibilidade da meta ("aprovações acumuladas").
- **`EARNED_POINTS` conta só créditos de tarefa aprovada** — sem loop com os
  pontos de resgate de conquistas/recompensas (senão conquistas alimentariam a
  própria conquista). Se um dia quiser que resgates contem, é um novo
  `metric_type` (ex.: `REDEEMED_POINTS`).
- **Sem notificação `ACHIEVEMENT_UNLOCKED`** — o desbloqueio já é visível na
  própria página (barra cheia + botão de resgate); criar tipo novo no sino e no
  Realtime seria escopo adicional sem pedido. Novos tipos de notificação ficam
  para quando houver demanda.
- **Recompensa plana** (`reward_points` por claim, resgatável de novo em
  repetíveis): escala por `target_count`/repetição; sem curva exponencial.
- **`updateAchievement` não recalcula progresso retroativamente** — mudar
  `target_count`/`metric_type` afeta apenas o futuro (o padrão de snapshot do
  projeto: título/custo são históricos em `notifications`, etc.).
- **Sem upload de imagem** nas conquistas: o ícone é um slug Lucide (sem inflar
  o storage/banco — mesma política do upload de imagem de tarefas).

## Consequências
- Módulo novo exige **deploy + SQL das tabelas** (pendente no Supabase): sem as
  tabelas, as ações falham e `/achievements` não renderiza. Nada quebra nas
  features antigas.
- O registro de progresso é lazy e idempotente por natureza (guard no valor
  lido); a exclusão de conquista libera as linhas de progresso via cascade.
- O ganho de pontos do resgate não participa do `EARNED_POINTS` (ver escopo) —
  documentado para não virar "bug" no futuro.
- Realtime das duas tabelas segue o padrão já estabelecido (policy SELECT por
  membro + publication); sem isso, a UI do dependente depende de
  `router.refresh()` pós-ação (coberto pela ação).
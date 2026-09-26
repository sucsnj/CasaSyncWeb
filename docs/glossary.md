# Glossário CasaSync Web

Definições dos termos de domínio usados no código e nos ADRs. Termos de produto
em primeiro; siglas técnicas resolvidas no fim.

## Papéis
- **ADMIN / tutor** — conta com `profiles.user_role = 'ADMIN'`. Controla casas
  via `house_members.role='ADMIN'` (criadas e co-geridas por PIN). Cria tarefas,
  recompensas, conquistas, dependentes; aprova/resgates; **não acumula pontos**.
- **DEPENDENT** — conta com `profiles.user_role = 'DEPENDENT'`, sempre criada
  pelo ADMIN. Conclui tarefas, resgata recompensas e conquistas; acumula os
  pontos exibidos na UI.
- **Autor da casa** — o `houses.owner_id` (criador). Único com ações de dono:
  expulsar membros, trocar o PIN, excluir a casa, excluir conta de dependente e
  redefinir a senha de outros membros.

## Casa e membros
- **Casa** (`houses`) — unidade multi-tenant; contém tarefas, recompensas,
  conquistas, notificações, settings e membros, todos isolados por `house_id`.
- **PIN da casa** (`houses.code`) — código único de convite/co-controle; também
  autoriza a alteração manual de pontos (`updateDependentPoints`).
- **Casa ativa** — casa corrente do ADMIN (cookie `casasync_active_house`);
  fallback para a primeira controlada quando ausente.

## Pontos e recompensas
- **Saldo / pontos acumulados** (`profiles.points`) — inteiro global por perfil,
  pode ser negativo. Creditado na aprovação de tarefa (valor corrente com
  decaimento), debitado em "não entregue"/resgate, ajustado manualmente com o PIN.
- **Decaimento** — valor corrente de `tasks.points` cai `pointsPerPeriod` a cada
  `periodHours` desde `decay_started_at` (capado no `due_date`, piso 0).
- **Resgate** (`reward_redemptions`) — pedido do dependente que o ADMIN aprova
  (debita pontos e encarece a recompensa) ou rejeita.
- **Sugestão** (`reward_suggestions`) — proposta de recompensa do dependente; o
  ADMIN aprova (vira recompensa real) ou rejeita.

## Tarefas
- **Status** — `PENDING`/`IN_PROGRESS` (aberta), `COMPLETED` (dependente
  concluiu), `APPROVED` (crédito pago), `NOT_DELIVERED` (penalizada).
- **Adiamento** — pedido de mais tempo; aprovado, soma dias ao prazo e reabre a
  tarefa (e devolve os pontos debitados se `NOT_DELIVERED`).
- **Restaurar** — reaproveitar uma tarefa `APPROVED` (`→ PENDING`, prazo +1 dia
  padrão da settings, sem mexer no crédito já pago).

## Conquistas
- **Conquista** (`achievements`) — meta por casa com `metric_type`, objetivo e
  recompensa em pontos; pode ser repetível (sobe de nível até o cap) ou única,
  secreta (`is_secret`) e ter imagem própria.
- **Métrica (`metric_type`)** — o que alimenta o progresso:
  `TASKS_APPROVED`, `TASKS_REJECTED`, `REWARDS_CLAIMED`,
  `CUSTOM_REWARDS_APPROVED`, `APP_LOGIN_DAYS`, `STREAK_LOGIN_DAYS`,
  `EARNED_POINTS` (volátil) e `MANUAL` (concessão pelo tutor).
- **Estatísticas (`dependent_stats`)** — contadores absolutos do dependente por
  casa; fonte de verdade **derivada** das métricas (exceto `EARNED_POINTS` e
  `MANUAL`). Iniciam zeradas.
- **Progresso (`dependent_achievements`)** — linha por (conquista, dependente):
  `level`, `current_progress`, `unlocked_at`. É a superfície de UI/Realtime;
  derivada das estatísticas (ou somada no crédito p/ `EARNED_POINTS`).
- **Desbloqueio** — `current_progress ≥ target_count` marca `unlocked_at` e dá o
  botão de resgatar a recompensa ao dependente.
- **Resgate de conquista** — creditar `reward_points × nível × multiplicador`
  direto em `profiles.points`; repetível reinicia o ciclo (`level+1` até o cap,
  rollover do excedente), única encerra.

## Notificações e push
- **Notificação interna** (`notifications`) — uma linha por destinatário;
  best-effort; o sino a ler.
- **Web Push (PWA)** — entrega nativa (SO/Android) via VAPID + service worker,
  complementar à notificação interna.
- **Mensagem rápida** — `QUICK_MESSAGE` (tipo de notificação) enviada pelo
  DEPENDENT aos ADMINs, com `message_id` agrupando as cópias; expira por
  `readRetentionDays` após a 1ª leitura de um tutor.

## Comunicados
- **Comunicado** (`comunicados`) — aviso da casa publicado pelo ADMIN que o
  dependente **precisa confirmar** (modal bloqueante). Rascunho (`published:
  false`) é invisível ao dependente. **Sem tempo real**: a 1ª exibição segue a
  regra "slot de hoje ou próximo" e só ocorre num render server-side
  (atualizar/trocar de endpoint) — dia agendado com horário já passado aparece
  já; antes do horário, espera o horário de hoje; dia não agendado → próximo dia
  agendado.
- **Repetição por dependente** — cada confirmação (`comunicado_deliveries`)
  agenda a próxima exibição (período em dias, dias da semana e horário em
  America/Recife) até completar `repeats_total` confirmações.
- **Confirmação / entrega** (`comunicado_deliveries`) — `delivered_count` +
  `last_confirmed_at` por (comunicado, dependente); `last_confirmed_at` é a
  referência do cálculo da próxima ocorrência.
- **Devido** — primeiro aviso sem entrega registrada quando `now >=` a 1ª
  ocorrência (slot de hoje ou próximo, **sem intervalo** no 1º ciclo) **ou**
  próxima ocorrência vencida (derivado no servidor via `getDueComunicados`); sem
  cron e sem Realtime — o "disparo" agendado só é calculado num render
  server-side (abertura/troca de endpoint/refresh após confirmar).

## Ganhos em Realtime
- **publication `supabase_realtime`** — índices de quais tabelas emitem eventos.
- **Realtime listener** — assinatura `postgres_changes` no browser via
  `usePostgresChanges`, que exige `setAuth` (ADR-0010) e RLS de SELECT.

## Siglas técnicas
- **RLS** — Row Level Security (policies do Postgres; backstop de autorização).
- **Service role** — cliente servidor (server-only) que contorna a RLS; escritas
  sensíveis e leituras cross-role com escopo sempre derivado da sessão
  (ADRs 0001/0006).
- **Server Action** — função `'use server'`; só exporta funções assíncronas
  (valores não-função devem viver em módulos puros — ver ADR-0015/`ACHIEVEMENT_ICONS`).
- **RSC** — React Server Components / payloads `RSC:1`; nunca ficam em cache do
  service worker (ver `PROJECT_STATUS.md`).
- **SLA / "Prazo próximo"** — aviso por horas restantes (`dueSoonHours`).
- **`setAuth`** — exigência do Realtime com sessão restaurada de cookies (ADR-0010).
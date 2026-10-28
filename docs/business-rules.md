# Regras de Negócio — CasaSync Web

## 1. Ciclo de Vida de Tarefas & Decaimento
- **Ciclo:** Dependente conclui (`COMPLETED`) → ADMIN aprova (credita pontos) ou desaprova (`PENDING`).
- **Atraso / Penalidade (`NOT_DELIVERED`):** ADMIN marca tarefa atrasada; debita pontos imediatamente do dependente (saldo pode ficar negativo). Reabrir via adiamento/edição zera os pontos da tarefa (`points = 0`) sem devolver os pontos debitados.
- **Em Espera (`ON_HOLD`):** Pausa tarefas (`PENDING/IN_PROGRESS/NOT_DELIVERED`). Esconde da lista do dependente e descarta adiamentos pendentes. Reativação volta para `PENDING` com novo prazo (`now + defaultDueDays`).
- **Restauração (`APPROVED → PENDING`):** `restoreTask` reinicia o ciclo com novo prazo sem alterar pontos já creditados.
- **Decaimento de Pontos (`task-decay.ts`):** Perde pontos a cada janela (`periodHours`) a partir de `decay_started_at`. Ponto de piso = 0. Aceitar adiamento reseta o relógio e fixa o valor corrente como nova base.

## 2. Recompensas & Resgates
- **Ciclo:** Dependente solicita → ADMIN aprova (`PENDING → APPROVED`, debita saldo) ou rejeita (`REJECTED`).
- **Sugestões:** Dependente envia sugestões; aprovação pelo ADMIN converte em recompensa real.
- **Desativação:** Recompensas inativas (`active = false`) ficam indisponíveis na loja e bloqueiam novos resgates.

## 3. Notificações & Mensagens Rápidas
- **Notificações:** Best-effort em `src/utils/notifications.ts`. Limpeza lazy por retenção (`notification_retention`).
- **Mensagem Rápida (`QUICK_MESSAGE`):**
  - Exclusivo Dependente → ADMINs (máx. 2 acumuladas por dependente).
  - Texto (≤100 chars) ou Imagem (Supabase Storage `/messages`).
  - Apagadas automaticamente após X dias (`readRetentionDays`) a partir da leitura por pelo menos um ADMIN.

## 4. Conquistas Gamificadas (`/achievements`)
- **Métricas:** Progresso rastreado via `dependent_stats` através de `registerAchievementProgress`.
- **Tipos:** 
  - *Repetíveis:* Acumulam progresso, sobem nível no resgate (`claimAchievementReward`), zeram o progresso do ciclo e pagam valor proporcional ao nível.
  - *Não Repetíveis:* Resgatáveis apenas no Nível 1.
- **Ajuste Manual:** ADMIN pode ajustar progresso de conquistas de métrica `MANUAL`.

## 5. Comunicados da Casa (`/dashboard/admin/comunicados`)
- **Exibição:** Apenas no render server-side (sem Realtime). Exibe em overlay bloqueante (`comunicado-overlay.tsx`) até o dependente confirmar.
- **Repetição:** Agendamento recalculado por dependente a cada confirmação via fuso `America/Recife`.
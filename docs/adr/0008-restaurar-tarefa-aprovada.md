# ADR-0008: Restaurar tarefa aprovada em vez de criar uma nova

**Status:** aceito · **Data:** reuso de tarefas

## Contexto
Tarefas recorrentes (ex.: "arrumar o quarto") eram recriadas do zero a cada ciclo, poluindo `tasks` com linhas praticamente idênticas. Já existia o `rejectCompletedTask` (`COMPLETED → PENDING`, sem crédito) para devolver a conclusão antes da aprovação, mas **nenhum** caminho para reaproveitar uma tarefa já **aprovada/creditada**.

## Decisão
- `restoreTask` (`src/actions/tasks.ts`): transição guardada `APPROVED → PENDING` (`.eq('status','APPROVED')`, evita restaurar duas vezes).
- Preserva todos os dados (título, descrição, `points`, `assigned_to`, `image_url`, `house_id`, `created_by`) e **não altera** os pontos já creditados em `profiles.points` — o crédito anterior é histórico.
- Limpa `completed_by`/`completed_at` e as flags de adiamento (`extension_requested`/`extension_reason`).
- Reinicia `due_date` para **agora + 1 dia** (SLA novo, sem nascer "Atrasada"); o ADMIN pode ajustar depois via `updateTask`.
- UI: botão "Restaurar" sempre visível no card "Aprovadas" do ADMIN; o card volta para Pendentes e o dependente a vê como `PENDING` pronta para concluir de novo.

## Consequências
- Reuso elimina duplicatas e preserva o histórico da tarefa na mesma linha.
- Diferente de `rejectCompletedTask` (não creditada) e da reversão de `NOT_DELIVERED` (devolve os pontos debitados), restaurar **não move pontos** em nenhuma direção: o dependente ganha de novo apenas se concluir e o ADMIN aprovar outra vez.
- O `+1 dia` é uma escolha de UX (ciclo com folga) e não uma regra de negócio rígida — ajustável pelo campo de prazo.

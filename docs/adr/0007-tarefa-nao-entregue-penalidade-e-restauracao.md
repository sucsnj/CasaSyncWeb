# ADR-0007: Tarefa "não entregue" — penalidade e restauração de pontos

**Status:** aceito · **Data:** UX de tarefas / status NOT_DELIVERED

## Contexto
Uma tarefa atrasada podia apenas ser concluída (pelo dependente) ou aprovada/creditada (pelo ADMIN via `adminCompleteTask`), mesmo depois do prazo. Faltava uma forma de punir o não cumprimento sem passar pelo fluxo normal de conclusão. A regra pedida: o ADMIN marca a tarefa atrasada como "não entregue" e os pontos que a tarefa valeria são **debitados** do dependente; para o dependente o botão "Concluir" some, mas o pedido de adiamento continua. Aprovar um adiamento (ou alterar o prazo) precisa **devolver** esses pontos e **zerar** o valor da tarefa.

## Decisão
- Novo valor no enum `task_status`: **`NOT_DELIVERED`** (`alter type public.task_status add value 'NOT_DELIVERED';`, aplicado manualmente no Supabase).
- `markTaskNotDelivered` (`src/actions/tasks.ts`): transição guardada `PENDING/IN_PROGRESS → NOT_DELIVERED` (`.in('status', [...])`, evita débito duplicado); só permite tarefa **atrasada** (`due_date < now`) e com dependente atribuído; debita `tasks.points` de `profiles.points` via service role. **O saldo pode ficar negativo** (penalidade aplicada integralmente, sem clamp em 0). Falha no débito → rollback do status.
- Reversão = adiamento aprovado: em `resolveTaskExtension` (aprovar) e em `updateTask` (alteração de `due_date`), se a tarefa está `NOT_DELIVERED`, **devolve** `tasks.points` ao dependente, **zera** `tasks.points` e redefine o status para o equivalente ao novo prazo (futuro → `PENDING`). Falha na devolução → rollback para `NOT_DELIVERED`.
- `NOT_DELIVERED` não tem "Concluir e creditar" (`adminCompleteTask` e `completeTask` o rejeitam) e não permite editar pontos diretamente (`updateTask`); os pontos só mudam pelo caminho de reversão.
- Restaurado o ponto de vista do dependente: ele continua vendo a tarefa em "Suas tarefas", sem o botão "Concluir", mantendo "Pedir mais tempo".

## Consequências
- Débito/crédito de pontos é reversível por um único caminho explícito (adiamento/prazo), preservando a simetria: debita na marcação, devolve na reabertura.
- Pontos negativos passam a existir como estado válido do saldo — a UI (loja/resgates) precisa tolerar saldo negativo; resgates continuam barrados pela validação de saldo.
- O valor da tarefa (`tasks.points`) é zerado ao reabrir: a tarefa reaberta não paga pontos mesmo se concluída depois — o "preço" da reabertura é o trabalho sem recompensa.
- `NOT_DELIVERED` é estado terminal enquanto o prazo não for reaberto; um novo atraso com `points = 0` não gera nova penalidade (débito de 0).

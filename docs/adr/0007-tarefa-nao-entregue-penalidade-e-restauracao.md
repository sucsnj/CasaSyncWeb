# ADR-0007: Tarefa "não entregue" — penalidade e restauração de pontos

**Status:** aceito · **Data:** UX de tarefas / status NOT_DELIVERED

## Contexto
Uma tarefa atrasada podia apenas ser concluída (pelo dependente) ou aprovada/creditada (pelo ADMIN via `adminCompleteTask`), mesmo depois do prazo. Faltava uma forma de punir o não cumprimento sem passar pelo fluxo normal de conclusão. A regra pedida: o ADMIN marca a tarefa atrasada como "não entregue" e os pontos que a tarefa valeria são **debitados** do dependente; para o dependente o botão "Concluir" some, mas o pedido de adiamento continua. Na redação original, aprovar um adiamento (ou alterar o prazo) precisava **devolver** esses pontos e **zerar** o valor da tarefa.

## Decisão
- Novo valor no enum `task_status`: **`NOT_DELIVERED`** (`alter type public.task_status add value 'NOT_DELIVERED';`, aplicado manualmente no Supabase).
- `markTaskNotDelivered` (`src/actions/tasks.ts`): transição guardada `PENDING/IN_PROGRESS → NOT_DELIVERED` (`.in('status', [...])`, evita débito duplicado); só permite tarefa **atrasada** (`due_date < now`) e com dependente atribuído; debita `tasks.points` de `profiles.points` via service role. **O saldo pode ficar negativo** (penalidade aplicada integralmente, sem clamp em 0). Falha no débito → rollback do status.
- ~~Reversão = adiamento aprovado: em `resolveTaskExtension` (aprovar) e em `updateTask` (alteração de `due_date`), se a tarefa está `NOT_DELIVERED`, **devolve** `tasks.points` ao dependente, **zera** `tasks.points` e redefine o status para o equivalente ao novo prazo (futuro → `PENDING`). Falha na devolução → rollback para `NOT_DELIVERED`.~~ **Superado pela emenda (ver abaixo): o débito não é mais devolvido.**
- `NOT_DELIVERED` não tem "Concluir e creditar" (`adminCompleteTask` e `completeTask` o rejeitam) e não permite editar pontos diretamente (`updateTask`); com a emenda abaixo, os pontos de uma não entregue **só** são alterados pela reabertura — que os zera.
- Restaurado o ponto de vista do dependente: ele continua vendo a tarefa em "Suas tarefas", sem o botão "Concluir", mantendo "Pedir mais tempo".

## Emenda (2026) — a penalidade é definitiva
O reembolso foi removido: **aprovar um adiamento ou alterar o prazo NÃO devolve mais os pontos debitados**. A reabertura mantém o `tasks.points = 0` (redefine o status para o equivalente ao novo prazo), então a tarefa volta a valer 0 e uma aprovação futura não credita nada. A mudança vale para **os dois fluxos** — `resolveTaskExtension` (aprovar) e `updateTask` (alteração de `due_date`) — para não existir brecha que burlasse a regra. Consequências: o `adjustPoints` positivo e os rollbacks de reembolso saíram das duas actions; uma tarefa "não entregue" tem custo real para o dependente. Ver **ADR-0018** (mesma emendaMotivo: "a tarefa não foi cumprida; reabri-la não devolve o já cobrado").

**Complemento (2026) — a mesma lógica vale para a tarefa ABERTA:** aceitar um adiamento (botão "Aprovar" ou o auto-aceite ao editar o prazo com pedido pendente) **não devolve os pontos originais** de uma tarefa que não estava em `NOT_DELIVERED` — o valor **corrente** (já reduzido pelo decaimento de pontos) vira a nova base e o relógio do decaimento reinicia, para que o crédito futuro seja o do valor no instante do aceite. Não é reembolso: nada volta, a base só deixa de contar a perda antiga duas vezes. Ver a seção "Adiamento aceito nunca devolve os pts originais" no `PROJECT_STATUS.md`.

## Consequências
- ~~Débito/crédito de pontos é reversível por um único caminho explícito (adiamento/prazo), preservando a simetria: debita na marcação, devolve na reabertura.~~ **Substituído pela emenda:** o débito é permanente; a reabertura só devolve a *oportunidade* (prazo novo), nunca o saldo.
- Pontos negativos passam a existir como estado válido do saldo — a UI (loja/resgates) precisa tolerar saldo negativo; resgates continuam barrados pela validação de saldo.
- O valor da tarefa (`tasks.points`) é zerado ao reabrir: a tarefa reaberta não paga pontos mesmo se concluída depois — o "preço" da reabertura é o trabalho sem recompensa.
- `NOT_DELIVERED` é estado terminal enquanto o prazo não for reaberto; um novo atraso com `points = 0` não gera nova penalidade (débito de 0).

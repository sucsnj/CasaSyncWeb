# ADR-0018: Tarefa em espera (`ON_HOLD`) e penalidade definitiva de `NOT_DELIVERED`

**Status:** aceito · **Data:** 2026 (pós-`NOT_DELIVERED`)

## Contexto
Faltava uma forma de o ADMIN **tirar uma tarefa de circulação** sem precisar concluí-la, aprová-la ou apagá-la: por exemplo, um desafio que só faz sentido numa época do ano ("fazer a mala de viagem"), uma tarefa que virou inválida depois de um fato novo, ou simplesmente uma tarefa que o tutor quer pausar por um tempo enquanto decide.

O que já existia:
- `NOT_DELIVERED` (ADR-0007) debitava os pontos e a **reversão** (adiamento aprovado ou edição do prazo) devolvia o valor ao dependente. Na prática, a punição era cancelável pelo próprio tutor com um clique, e o dependente podia "comprar" a volta da tarefa sem fazer nada.
- Não havia estado "pausada": as únicas formas de tirar uma tarefa aberta da frente do dependente eram concluir/aprovar (que pagam ou congelam pontos) ou apagar.

## Decisão
1. **Penalidade de `NOT_DELIVERED` é definitiva.** Aprovar um adiamento (`resolveTaskExtension`) ou alterar o prazo (`updateTask`) **reabre** a tarefa mas **não devolve** os pontos: o `tasks.points` vai a `0` e o status passa a ser o equivalente ao novo prazo. Nenhum fluxo devolve o débito. Vale para os **dois** caminhos, senão a regra seria burlável pela edição direta do prazo. (Emenda ao ADR-0007.)
2. **Novo valor no enum `task_status`: `ON_HOLD`** ("em espera"), aplicado manualmente no Supabase (`docs/sql/task_on_hold.sql`).
   - Quem entra: só `PENDING`, `IN_PROGRESS` e `NOT_DELIVERED` (uma tarefa concluída/aprovada é histórico e não faz sentido pausar).
   - Uma `NOT_DELIVERED` que entra em espera entra **já valendo 0 pontos** — é a consequência direta do item 1: pausar não é um caminho para escapar da penalidade.
   - Uma tarefa pausada **sai da lista do dependente por completo** (filtro `neq('status','ON_HOLD')` no carregamento de `/tasks`), e nenhuma action do dependente age: `completeTask`/`requestTaskExtension` já exigem `PENDING/IN_PROGRESS`, `markTaskNotDelivered` não aceita e o pedido de adiamento pendente é descartado na pausa (o dependente pede de novo quando ela volta).
   - Ao reativar, a tarefa volta **sempre** como `PENDING`, com **prazo novo** (agora + `task_sla.defaultDueDays` da casa) e **relógio do decaimento reiniciado** — o mesmo ciclo de `restoreTask` (ADR-0008). Os pontos atuais são preservados e o saldo do dependente não é tocado em nenhum dos dois sentidos.
3. **Uma action só:** `setTaskOnHold(taskId, onHold)` (`src/actions/tasks.ts`), com guard de status na própria transition (`.in('status', [...])` ao pausar, `.eq('status','ON_HOLD')` ao reativar) — mesma defesa contra clique concorrente das demais actions. Notificação ao dependente nos dois sentidos (`TASK_ON_HOLD` na pausa, `TASK_RESTORED` na reativação).
4. **Limpeza de membro:** `expelMember`/`deleteDependentAccount` passam a apagar também as tarefas `ON_HOLD` (é dado ativo da casa, não histórico) — evita órfãos que reapareceriam se o mesmo `username` fosse recriado.
5. **Pausar esconde, não congela (emenda de 2026).** A versão original congelava a edição ("reative antes de editar"). Agora `updateTask` aceita `ON_HOLD` (só `COMPLETED`/`APPROVED` seguem imutáveis) e o card em espera tem os mesmos campos editáveis do card pendente (título, descrição, responsável, pontos). Motivo: pausar é uma decisão de **circulação** (a tarefa não está valendo agora), não de conteúdo — obrigar o tutor a reativar para corrigir um título era atrito puro. O **prazo** continua fora: a reativação sempre calcula um prazo novo, então um campo de prazo ali seria descartado em silêncio (aparece como texto "Prazo atual (temporário)"). Editar não mexe no status, no saldo nem no `dependent_stats`.

## Consequências
- O tutor tem uma terceira transição "neutra": pausar não paga, não cobra e não polui as métricas de conquistas (`dependent_stats` não é tocado — pausar não é aprovar nem rejeitar).
- O status `ON_HOLD` é **invisível para o dependente**, e não "bloqueado": ele simplesmente não vê a tarefa. Uma tarefa pausada de um dia precisa ser reativada pelo tutor; se ninguém reativar, ela fica parada (comportamento equivalente a um rascunho).
- `tasks.image_url`, descrição e atribuição continuam guardadas durante a pausa (nada é apagado) e **editáveis** pelo tutor.
- **Depende de schema (aplicado):** o `docs/sql/task_on_hold.sql` já foi rodado no Supabase pelo usuário. Nele, `setTaskOnHold` separa `error` de "guard devolveu 0 linhas" e devolve uma mensagem específica no `22P02` (enum sem o valor), em vez de dizer que "outra pessoa" mudou a tarefa.
- Se no futuro a pausa virar "adiar sem perder pontos" para o dependente, o caminho é um novo status (ex.: `ON_HOLD` + coluna de pontos congelados) — não reintroduzir o reembolso do ADR-0007.
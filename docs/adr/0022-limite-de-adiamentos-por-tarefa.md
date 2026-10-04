# ADR-0022: Limite de adiamentos por tarefa

**Status:** aceito — **Data:** 2026

## Contexto
Uma tarefa podia ser adiada indefinidamente: o dependente pede, o ADMIN aprova, e
o ciclo se repete. O único limite existente era o **tamanho** do adiamento (os
botões "Aprovar (+N dias)" vêm de `extension_rules.dayOptions`), nunca a
**quantidade** — e foi justamente por isso que a mecânica foi deixada de fora
("decisão de produto", registrado em `src/utils/settings.ts`).

Ao procurar como implementar, apareceu um problema de dados: **não existe
histórico de adiamentos**. `tasks.extension_requested`/`extension_reason` são
flags do pedido **atual** (limpas quando o pedido é resolvido), então não dá para
saber quantas vezes uma tarefa já foi esticada.

## Decisão
1. **Coluna nova `tasks.extension_count int not null default 0`.** É a única forma
   de ter o contador sem inventar metadado. Tarefas existentes nascem em `0`:
   não há como saber quantos adiamentos elas já tiveram, e **inventar histórico
   seria pior** do que recomeçar a contagem — o limite só começa a valer daqui
   pra frente, e isso está dito na dica da tela.
2. **O contador soma na APROVAÇÃO**, não no pedido: recusar não estica prazo, e
   um pedido recusado pelo ADMIN não pode consumir o orçamento do dependente. O
   default é `0` (ilimitado), então **preserva o comportamento atual** de toda
   casa que nunca mexeu na tela.
3. **A trava fica no pedido do dependente** (`requestTaskExtension`), com mensagem
   clara. O ADMIN continua podendo aprovar um pedido feito *antes* de a casa baixar
   o limite — é a escolha dele, e o texto do limite é sobre o pedido, não sobre a
   decisão.
4. **Não contam** como adiamento: recusar o pedido, **editar o prazo direto no
   card**, `restoreTask` e a reativação de `ON_HOLD`. Todos dão prazo novo, mas
   são decisão do ADMIN — e ele sempre pode mudar o prazo direto, então limitá-lo
   nesses caminhos só criaria uma regra inconsistente (burlável pelo mesmo botão
   que edita o prazo).
5. **Corrigida uma corrida no mesmo caminho.** `resolveTaskExtension` fazia
   `update().eq('id', taskId)` sem nenhuma guarda de estado: dois cliques rápidos
   em "Aprovar (+3 dias)" liam o pedido pendente e aplicavam **duas vezes** (o que
   também somaria o contador duas vezes). Ganhou
   `.eq('extension_requested', true)` — a mesma defesa de transição guardada que o
   resto do app já usa — e "0 linhas" vira "este pedido já foi resolvido por outra
   pessoa".

## Consequências
- **Ordem de deploy:** o SQL tem de estar aplicado **antes** do deploy, senão as
  actions de adiamento quebram com `column "extension_count" does not exist`.
- Uma casa que já usava muito adiamento começa com folga — a regra é prospectiva.
- Baixar o limite passa a valer imediatamente, inclusive para tarefas que já
  passaram do novo teto (elas deixam de aceitar novo pedido).
- O ADMIN vê o consumo no banner do pedido ("N de M adiamentos usados") e o
  update otimista já soma o contador na hora, sem esperar o `router.refresh()`.
- O limite é **por tarefa e por casa**, nunca global: não existe "total de
  adiamentos da casa por semana".
# ADR-0013: Prazos de tarefa sempre com fuso horário

**Status:** aceito · **Data:** correção do bug de 3h (set/2026)

## Contexto
O `<input type="datetime-local">` produz um valor **sem fuso** (`YYYY-MM-DDTHH:mm`) —
a hora de parede local de quem digita (America/Recife = UTC-3). O formulário de
tarefas enviava essa string **naive** direto para a coluna `tasks.due_date`
(`timestamptz`); o Postgres interpreta string sem fuso na **timezone da sessão do
servidor** (Supabase: UTC) → um prazo digitado 14:30 virava `14:30Z` = **11:30 em
Recife** (3h adiantado). Parecia "às vezes certo" porque o card otimista de
`saveDueDate` usava `new Date(value).toISOString()` no browser (instante certo),
mas o servidor gravava a string crua — o valor deslocado só aparecia no
refresh/Realtime.

## Decisão
- **Cliente converte antes de enviar** (`datetimeLocalToIso` em
  `src/utils/datetime-local.ts`): interpreta o valor naive no fuso **do
  dispositivo** (`new Date(naive)` no browser = hora local por especificação do
  ECMAScript; `typeof window` trava para nunca rodar no servidor) e retorna o
  instante UTC (`...Z`). Falha "loud": `null` para valor inválido ou uso fora do
  browser.
- **Servidor rejeita string sem fuso** (`normalizeDueDate` em
  `src/actions/tasks.ts`, usada em `createTask` e `updateTask`): fail-closed —
  uma naive que voltar a chegar vira erro visível em vez de re-corromper a data
  em silêncio.
- **Exibição local só no cliente** (`FormattedDateTime` em
  `src/components/ui/formatted-date.tsx`, via `useSyncExternalStore`): nos cards
  sempre renderizados, formatar hora local no SSR (Vercel/Netlify = UTC)
  produzia hydration mismatch + flash de hora UTC; o componente renderiza um
  placeholder estável até a hidratação e então formata no fuso de quem vê.
- **Sem mudança de schema** (`due_date` continua `timestamptz`) e **sem lib de
  datas**: a especificação do ECMAScript + a trava de ambiente resolvem fuso/DST
  por dispositivo sem nova dependência.
- **Dados já criados com o bug:** correção **opcional e revertível** (backup em
  `tasks_due_date_backup` + `UPDATE ... + interval '3 hours'` só nas linhas com
  precisão de minuto — marca de entrada por `datetime-local`), porque o desvio é
  o offset do operador no momento do cadastro.

## Consequências
- O prazo armazenado é um **instante absoluto**: hosting (Vercel/Netlify = UTC) e
  session timezone do Postgres ficam irrelevantes; cada dispositivo renderiza o
  mesmo instante na própria hora local.
- Prazos gerados pelo servidor (`restoreTask`, `resolveTaskExtension`,
  auto-aceite do `updateTask`, `markTaskNotDelivered`) já nasciam como instantes
  (`.toISOString()`) — corretos sem mudança.
- O SQL de reparo só faz sentido no offset em que os dados foram digitados
  (Recife = +3h); se houver entradas em múltiplos fusos, nenhum intervalo único
  corrige tudo — preferível re-editar individualmente.
- Contrato novo: todo `due_date` que trafega do cliente é texto **com fuso**
  (`Z`/`±HH:MM`); a naive deixou de ser um valor aceito.
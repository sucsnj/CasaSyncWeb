# ADR-0021: Fuso horário por casa e fim do offset fixo de America/Recife

**Status:** aceito — **Data:** 2026

## Contexto
`America/Recife` estava **hardcoded** em dois lugares, e o cálculo dependia de um
offset fixo de −3h:

- o **agendamento dos comunicados** (`utils/comunicados.ts`): `repeat_time` é hora
  de parede, virava instante com `RECIFE_UTC_OFFSET_MS`;
- o **dia-contagem da Streak** (`actions/stats.ts`): `recifeDay()` formatava o dia
  com `timeZone: 'America/Recife'`.

Uma casa fora do fuso de Recife tinha dois defeitos: o comunicado era cobrado no
horário errado e o dia da Streak fechava no horário errado. E o offset fixo, por
definição, nunca poderia lidar com horário de verão.

Ao generalizar o fuso, a validação dos helpers puros revelou que o **código antigo
tinha o sinal trocado nos dois pontos** — e isso não era hypothético:

- `recifeWeekday()`: `new Date(instant + 3h).getUTCDay()`. Como local = UTC − 3h,
  para ler a data local é preciso **subtrair** 3h; o código somava, ou seja,
  devolvia o dia da semana de *(local + 6h)*.
- `slotOf()`: usava o mesmo `+ 3h` para descobrir a **data-calendário local** do
  instante (o `+ 3h` do fim da conta está certo: parede → UTC é `UTC = local + 3h`).

## Decisão
1. **Fuso por casa** (chave `house_timezone`, nome IANA, default `America/Recife`),
   lido sempre da casa da sessão — nunca por parâmetro público.
2. **Novo módulo puro `src/utils/timezone.ts`**, todo o trabalho no `Intl`:
   - `zonedOffsetMs(instant, tz)`: quanto o fuso está à frente de UTC, **calculado**
     (e portanto já DST-aware) e truncado ao segundo;
   - `zonedWallClockToInstant(y, m, d, h, min, tz)`: relógio de parede → instante,
     em **duas passagens** (o primeiro chute usa o offset do instante aproximado; o
     segundo refina com o offset do resultado). É esse par que resolve a borda de
     DST, em que o instante resultante cai em outro offset que o chute;
   - `zonedWeekday(instant, tz)`: desloca pelo offset **calculado** e lê o dia UTC;
   - `zonedDay(tz, offsetDays)`: `YYYY-MM-DD` local, para a Streak;
   - `isValidTimeZone(tz)`: o guard é **o próprio `Intl`** (construtor lança em nome
     inválido), não uma lista fechada — a lista da UI é só conveniência.
3. **Assinatura dos helpers de comunicado passa a receber o fuso:**
   `nextComunicadoOccurrence(after, schedule, timeZone)` e
   `firstComunicadoOccurrence(now, schedule, timeZone)`. `recifeWeekday` e
   `recifeOffsetHours` foram **removidos** (não usados fora do módulo).
4. **Efeito colateral aceito:** trocar o fuso reancora o horário dos comunicados já
   agendados, porque `repeat_time` é hora de parede — o próximo disparo passa a ser
   calculado no fuso novo.

## Consequências
- **Corrige um bug de 34%:** medindo 240 agendas × 5.840 instantes (2 anos, de 3 em
  3 horas), o código antigo divergia do comportamento correto em **34% dos cenários**;
  o novo diverge em **0**. O caso prático: comunicado de domingo às `00:00`, avaliado
  às 18:00 de domingo — o horário já passou, então devia aparecer na hora; o antigo
  empurrava para o **domingo seguinte** (7 dias de atraso).
- **Passa a lidar com DST**, algo que o offset fixo nunca fez (verificado com
  Lisboa/Santiago/New York em 40 dias, incluindo a virada).
- **Não muda o prazo das tarefas**, que continua sendo o horário do dispositivo de
  cada um (o input `datetime-local` e o `FormattedDateTime` do cliente) — o fuso da
  casa afeta só comunicados e Streak, e a UI diz isso.
- `revalidatePath` nas 3 rotas do dependente ao salvar: o fuso muda o que está "devido"
  no overlay de comunicados e o dia da Streak, ambos calculados no render.
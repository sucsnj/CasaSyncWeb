# ADR-0017 — Comunicados: avisos da casa que o dependente precisa confirmar

Status: Aceito (requer aplicar o SQL e deploy)

## Contexto

O ADMIN precisa publicar avisos importantes da casa (reuniões, recados,
orientações) que o dependente **precisa ler e confirmar** — não é uma
notificação descartável do sino. O aviso deve aparecer para o dependente
**respeitando uma agenda** (dias da semana + horário em America/Recife), ser
repetido por agendamento (N confirmações por dependente, período em dias) e o
dependente só prossegue ao tocar em "Confirmar".

**Sem tempo real (decisão de produto, 2026):** tentou-se entregar o aviso ao
vivo/na hora — primeiro via Realtime direto de `comunicados` (não entregava
mesmo com policy + publication aplicadas) e depois via notificação
`COMUNICADO_PUBLISHED` como sinal (funcionava, mas o esforço era
desproporcional ao objetivo). **Abandonado:** o comunicado só é exibido no
render server-side das telas do dependente — ao atualizar a página, trocar de
endpoint ou após confirmar.

## Decisão

### Modelo de dados

- **`comunicados`** — uma linha por aviso da casa ativa: `title` (≤120),
  `description` (≤500), `published` (rascunho vs. publicado), `repeats_total`
  (1–100), `repeat_interval_days` (0–365; 0 = sem período fixo),
  `repeat_weekdays` (`int[]`, default todos os dias), `repeat_time`
  (`time`, default `08:00`). FKs: `house_id` CASCADE, `created_by` SET NULL.
- **`comunicado_deliveries`** — uma linha por (comunicado, dependente, casa):
  `delivered_count` e `last_confirmed_at`. `UNIQUE (comunicado_id, profile_id)`.
  Sem policies client: só o service role lê/escreve (padrão ADR-0006).
- **Sem Realtime client:** a entrega é por render server-side
  (`getDueComunicados()`/`confirmComunicadoDelivery` via service role) — não há
  policy de SELECT nem publication para `comunicados`/`comunicado_deliveries`
  (se aplicadas no banco, ficam inofensivas). A UI do ADMIN (total de
  confirmações) atualiza via `router.refresh()` pós-ação.

### Regras de negócio (fixadas com o usuário)

- **1ª exibição em "slot de hoje ou próximo"** (regra do usuário): num dia
  agendado, se o horário de hoje já passou o aviso é devido de imediato (aparece
  no próximo render); se ainda não chegou, espera o horário de hoje; em dia não
  agendado, vai para o próximo dia agendado. O intervalo de repetição não conta
  nesse primeiro ciclo.
- **Repetição é por dependente.** Cada "Confirmar" soma `delivered_count`, grava
  `last_confirmed_at` e agenda a próxima exibição via
  `nextComunicadoOccurrence(after, agenda)` (referência = `last_confirmed_at` +
  período em dias; candidato = primeiro instante ≥ referência cujo dia está em
  `repeat_weekdays` e cujo relógio local é `repeat_time`). Ao completar
  `repeats_total`, o dependente para de receber.
- **Sem cron/background no projeto:** o "disparo agendado" é mero cálculo
  server-side no `getDueComunicados()` (usado no render de cada tela e no
  refresh do overlay). "Devido" = **sem** linha de entrega e `now >=` a 1ª
  ocorrência (slot de hoje ou próximo, intervalo 0 no primeiro ciclo) **ou**
  `now >= próxima ocorrência` de `last_confirmed_at` (repetições). **Sem
  Realtime:** um aviso só aparece num novo render server-side (atualizar página,
  trocar de endpoint ou após confirmar) — o horário passado do dia não é pulado,
  aparece no render seguinte (o helper devolve o próximo instante **futuro**).
- **Confirmação é bloqueante:** overlay em portal `z-[120]` (acima do Modal),
  sem botão fechar, sem toque fora, sem Esc, com foco preso no botão
  "Confirmar" e scroll do documento travado. A fila é uma-a-uma; itens não mais
  confirmáveis (despublicado/descartado pelo servidor) são removidos da fila.
- **Fuso do agendamento = America/Recife** (UTC-3 fixo, sem DST): mesmo fuso do
  `registerLoginDay`. A conversão é linear via offset fixo (`+3h` ao instante =
  relógio de parede), sem lib de datas.

### Escopo

- ADMIN: página `/dashboard/admin/comunicados` (rascunho → Publicar/Despublicar,
  editar, excluir com confirmação; total de confirmações da house) + card
  "Comunicados" na visão geral — **sem** item extra na nav (que foi calibrada
  para 5 itens); link só pelo card, como `/dashboard/admin/settings`.
- DEPENDENT: overlay nas 4 telas dependentes (`/dashboard/dependent`,
  `/tasks`, `/rewards`, `/achievements`) com fila inicial **do servidor** e
  **sem Realtime** — o aviso entra apenas num render server-side; `refreshDue()`
  reavalia a fila após confirmar.
- Autorização sempre derivada da sessão (ADR-0001/0006): ADMIN valida controle
  pela membresia (`house_members.role='ADMIN'`) e casa ativa; DEPENDENT pela
  própria casa. Nenhum `house_id` vem de parâmetro público.

## Consequências

- **Requer SQL aplicado no Supabase** (bloco em `docs/sql/comunicados.sql` e na
  seção "Comunicados" do `PROJECT_STATUS.md`) e **deploy** para valer online.
- A agenda (dias/horário) vale para a **1ª exibição e as repetições**; editar a
  agenda não recalcula confirmações já feitas.
- Limite conhecido: sem Realtime nas entregas, o total de confirmações da tela
  ADMIN só entra ao salvar/abrir (refreshes pós-ação) — aceito.
- Limite conhecido: um "horário que passou" num dia da semana diferente do hoje
  só dispara na abertura (sem cron), conforme a regra fixada.
# CasaSync Web — PROJECT STATUS

## Estado atual (verificado — sem pendências)

- **Banco:** todos os scripts SQL já foram aplicados. Confirmado por probe:
  `tasks.extension_count` responde (com `0` nas tarefas existentes),
  `dependent_punishments` responde, e `house_settings` já tem as chaves novas
  gravadas (`task_rules`, `notification_mute`, `house_timezone`, `extension_rules`).
  **Nada pendente no banco** — o item em `AGENTS.md` §3 voltou a ser "nada pendente".
- **Features:** castigo do dependente, silenciamento de notificações, limites de
  tarefas, limite de adiamentos e fuso horário por casa — todas testadas, sem bug
  ou inconsistência visual conhecida até o momento.
- **Fila de configuração — decisão de projeto:** `permissions` (só o autor altera
  pontos/configurações) e `task_proof` (comprovação por foto) **não entram no
  produto**; as regras atuais permanecem como estão. Registrado no **ADR-0023**
  para que não voltem como "pendência técnica" no futuro.
- **Ainda não há deploy** dessas entregas.
- **Masonry nas listas de cards:** aplicado nas **3 seções de
  `tasks-dependent.tsx`**, nas **4 seções de `tasks-admin.tsx`**, na **Loja
  de recompensas** do dependente (`rewards-dependent.tsx`) e nos **8 cards de
  Configurações** (`settings-admin.tsx`). O usuário **validou na tela** o piloto
  em Tarefas ("muito agradável visualmente") e pediu a continuidade nas outras
  telas. **Conquistas e Comunicados** ainda seguem com a regra anterior
  (`items-start`). Ver as seções no topo do documento.
- **Rodapé ancorado nos cards de conquista do dependente:** o botão "Resgatar",
  a barra de progresso e a pill de pontos desceram juntos para a base do card
  (`mt-auto`) — sem isso o botão ficava grudado no texto, com um vão vazio
  embaixo. Testado em tela. Ver a seção no topo do documento.
- **Delay do feedback "Alterações salvas" virou constante ajustável:** o tempo em
  que o botão de ação do card fica escondido durante a edição de campo agora é a
  constante `SAVED_FEEDBACK_MS` no topo do `debounced-field.tsx` — pode ser
  mudado **para cima ou para baixo** conforme o tempo de leitura desejado. E o
  timer passou a usar uma ref própria, para que o ciclo anterior seja cancelado.
  Testado em tela. Ver a seção no topo do documento.
- **Notificações multi-casa:** o sino é global e as notificações de todas as
  casas do ADMIN se misturam. Agora cada notificação de **outra** casa mostra um
  **chip com o nome dela**, e ao clicar o app **troca a casa ativa antes de
  navegar** (com aviso em toast). Testado em tela. Ver a seção no topo.
- **Feedback imediato + guards em todas as transições de tarefa:** o botão reage
  no mesmo quadro (otimista antes do `await`, com rollback condicional) e
  **toda** escrita em `tasks` ganhou guard de transição — `completeTask`,
  `requestTaskExtension`, `updateTask` e os 3 rollbacks estavam sem ele, e o
  `completeTask` permitia sobrescrever um `APPROVED` já creditado. Ver a seção
  no topo do documento.
- **Quatro correções de uma revisão de código (P2/P3/P4/R4):** revalidação de
  contexto de casa virou **fonte única** (`revalidateHouseContext()` nas 11
  actions de casa), o `toLocaleString` que quebrava a hidratação do card de
  concluídas virou `FormattedDateTime`, os 6 `startTransition(async …)` do
  `houses-manager.tsx` viraram flags por operação (dois deles por id), e o
  `setFormError(null)` que apagava erro do form de criação saiu da transição de
  card. `lint`/`typecheck`/`build` ✓. Ver a seção no topo do documento.
- **Adiamento aceito nunca devolve os pts originais:** quando um adiamento é
  aceito (botão "Aprovar" ou o auto-aceite ao editar o prazo com pedido
  pendente), o **valor corrente** da tarefa passa a ser a nova base e o relógio
  do decaimento reinicia — 10 que decaiu para 7 **passa a valer 7** e volta a
  decair com o prazo estendido. A "não entregue" segue valendo **0**
  (penalidade definitiva). Ver a seção no topo do documento.
- **Limitação de plataforma do Web Push (aceita, não é bug):** com o app
  **varrido dos recentes**, o SO mata o Web Push e a notificação nativa não
  chega em nenhum navegador (Chrome, Edge e Firefox testados). O **sino continua
  funcionando**, porque vem do Realtime do Supabase — as notificações aparecem
  ao reabrir o app. A-distinto disso, no **Edge em HyperOS** o push não chega
  **nem com o app aberto** e com a permissão liberada (a distro bloqueia o
  registro de push do Edge); no Chrome do mesmo aparelho funciona. Nada a fazer
  no código — o caminho do navegador não existe nesse par SO/navegador.

---

## Adiamento aceito nunca devolve os pts originais (implementado — sem mudança de schema)

### O que mudou
**Regra nova:** quando um adiamento é **aceito** — por qualquer um dos dois caminhos — os pontos originais da tarefa **não voltam**. O valor corrente no instante do aceite vira a **nova base**, e o relógio do decaimento reinicia para ela decair de novo durante o prazo estendido.

> Exemplo do usuário: tarefa de **10 pts** que decaiu para **7** → ao aceitar o adiamento ela **passa a valer 7** (e volta a decair: 7 → 6 → 5…).

**Os dois caminhos de aceite** (a mesma regra nos dois, senão o ADMIN teria dois resultados para o mesmo ato):
- **`resolveTaskExtension(approve: true, days)`** — o botão "Aprovar (+N dias)".
- **auto-aceite do `updateTask`** — o ADMIN altera o prazo direto no card com um pedido **pendente** (o pedido é considerado aceito com a nova data).

### O que foi encontrado no caminho
A documentação afirmava que "as devoluções restauram esse mesmo valor corrente", mas **isso nunca foi implementado**: nenhum dos dois caminhos escrevia em `tasks.points`. O que existia no código era só a revalidação (`revalidateHouseContext`) e, para `NOT_DELIVERED`, o zero. A frase estava errando a documentação ou describindo uma intenção que se perdeu — e foi justamente por isso que a regra ficou ambígua quando o usuário pediu a mudança.

### Detalhe que decide a implementação
**Trocar a base sem reiniciar o relógio contaria o decaimento duas vezes.** Se `tasks.points` passasse a 7 mantendo `decay_started_at` antigo, um dia depois o valor seria `7 − 4 = 3` em vez de `6` (a perda antiga contaria de novo em cima da base já reduzida). Por isso os dois passos são ** inseparáveis**:

1. `points` = valor corrente calculado **com o prazo ANTIGO** — que é o que capava a janela; usar o prazo novo somaria períodos que ainda não aconteceram;
2. `decay_started_at` = agora (novo ciclo a partir da base nova).

**`isAdiamento` saiu do `updateTask`:** a exceção que existed ("adiamento não reinicia o relógio") existia só porque o adiamento não mexia na base — com a base trocada, ela virou redundante e até perigosa (num pedido de adiamento + edição de pontos na mesma chamada, a base explícita ficaria com o relógio antigo). Agora **toda** edição reinicia o relógio, sem guarda. A reabertura de `NOT_DELIVERED` continua inofensiva: base 0 não decai (`getTaskCurrentPoints` devolve 0 na hora).

### A tarefa "não entregue" NÃO mudou
Segue valendo **0 pontos** — a penalidade é definitiva (ADR-0007/0018) e aceitar o adiamento **não devolve** o que foi debitado. Foi uma decisão explícita do usuário ao ser consultado, e é coerente com a regra nova (0 também é "não restaurar os originais"). O crédito de uma aprovação futura continua sendo 0.

### UI
Os dois caminhos de cliente **espelham a regra do servidor** com o mesmo helper puro (`getTaskCurrentPoints` + prop `taskDecay`), para o card não ficar um instante mostrando o valor antigo:
- `saveDueDate` (auto-aceite): além de limpar as flags, grava `points` = valor corrente e `decay_started_at` = agora;
- `handleResolveExtension` (botão "Aprovar"): o otimista faz o mesmo (o servidor já devolvia a linha autoritativa, então a reconciliação vem junto).

### Verificação
`npm run lint` ✓ (**0 warnings**) · `npm run typecheck` ✓ · `npm run build` ✓ (16 rotas).
Módulo puro real executado com `node --experimental-strip-types` (script temporário fora do repo): o cenário do usuário fecha — base 10, 3 períodos decorridos, prazo +2d → **valor no aceite 7**; com a nova base e o relógio reiniciado, 1 dia depois **6**, 2 dias **5**, 5 dias **2**. O **contra-teste do decaimento em dobro** (base 7 com o relógio velho) daria **3** em vez de 6 — confirmando que a troca de base sem o reset seria um bug. Casos-limite: base 0 → 0; decaimento desligado → base intacta; sem prazo → janela até agora; `getTaskDecayStart` com `decay_started_at` nulo → fallback `created_at`; tarefa atrasada (janela capada) → valor estável no aceite e novo ciclo depois.

### Pontos de atenção
- **Não há como "voltar" os pontos originais depois do aceite** — é proposital. Quem quiser aumentar o valor edita o campo de pontos do card (isso reinicia o relógio por ser uma edição).
- **O valor materializado é sempre o do instante do aceite.** Se o ADMIN abrir o pedido e aprovar 5 dias depois, a base vira o valor de agora, não o de quando o dependente pediu.
- **Editar o prazo sem pedido pendente não é adiamento:** continua sendo uma edição comum — o relógio reinicia e a base **não** é materializada (o decaimento segue a partir da base, como sempre). O contador de `extension_count` também não conta esse caminho, como já era.
- **Patch de pontos explícito tem precedência** sobre a materialização, se vierem na mesma chamada (a UI nunca faz isso — cada campo é enviado separado).
- O `README`/ADR-0007 já descrevem a penalidade como definitiva; **nenhum ADR novo foi necessário** — a regra do decaimento nunca teve ADR próprio, e o ADR-0007 continua válido (a emenda já dizia "o débito não é mais devolvido").

---

## Quatro correções de um achado da revisão (concluídas — lint/typecheck/build ✓, sem mudança de schema)

A revisão do padrão de transição de tarefa (seção seguinte) deixou uma lista de
achados "fora do escopo". Três deles foram fechados agora, mais um quarto
achado do mesmo tipo. Nenhum deles quebrava o build — `lint`/`typecheck`/`build`
passavam com todos os quatro no código.

### P2 — a lista de revalidação das actions de casa era escrita à mão (7 actions)

Cada action de casa repetia seu próprio bloco de `revalidatePath`, e os blocos
**divergiam**: `/achievements` estava só no `selectHouse` (faltando em 7) e
`/dashboard/dependent` só em `updateDependentPoints` e `expelMember`.

A omissão **não dá erro** — a rota simplesmente serve o payload antigo e a tela
mostra dado da casa anterior. O pior caso era o `deleteHouse`: ele apaga a casa
e zera o cookie da casa ativa, mas deixava `/tasks`, `/rewards`, `/achievements`
e `/dashboard/dependent` servindo dados de uma casa que não existe mais.

**Correção — fonte única em `src/actions/houses.ts`:** `HOUSE_CONTEXT_ROUTES`
(6 rotas) + `revalidateHouseContext()`. As **11 actions** de casa agora chamam o
helper: `createHouse`, `selectHouse`, `joinHouseByPin`, `createDependent`,
`updateHouse`, `updateDependentProfile`, `updateDependentPoints`, `expelMember`,
`deleteDependentAccount`, `rotateHousePin` e `deleteHouse`.

A lista cheia vale mesmo nas actions cujo dado é mais estreito (`rotateHousePin`
só muda o código exibido, e antes revalidava 2 rotas): todas as rotas são
dinâmicas, então invalidar a mais não custa nada — e um bloco "curto" deixado
no arquivo é exatamente o que a próxima action copiaria por engano, que é como o
achado nasceu.

### P3 — `toLocaleString` em card renderizado no SSR (hydration mismatch)

O card "Concluídas — aguardando aprovação" (`tasks-admin.tsx`) formatava a data
de conclusão com `new Date(task.completed_at).toLocaleString('pt-BR')` **no
JSX**. Esse card é renderizado já no servidor (UTC) e re-hidratava no cliente
(fuso do dispositivo) — logo, hora errada no HTML e hydration mismatch.

**Correção:** `FormattedDateTime` (ADR-0013), que renderiza placeholder
estável até hidratar. O import já existia no arquivo; o ADR já proibia esse
padrão — a linha era uma violação da regra vigente, não uma regra nova.

### P4 — `startTransition(async …)` em `houses-manager.tsx` (6 handlers)

Mesmo anti-padrão já proibido pelo `AGENTS.md` §3: `startTransition` **nunca**
marca `isPending` (o React não rastreia a Promise do callback), então todo
`disabled={pending}` e todo `{pending ? 'Criando...' : 'Criar casa'}` era
**código morto** e o botão parecia travado durante todo o trabalho do servidor.

**Correção — um flag por operação**, seguindo o padrão que o próprio arquivo já
usava (`depPending`/`pointsPending`/`actionPending`):

| Handler | Flag |
|---|---|
| Criar casa / Entrar com PIN | `housePending` |
| Salvar casa (edição) | `editHousePending` |
| Salvar dependente (edição) | `editDependentPending` |
| Trocar casa ativa | `selectingHouseId` (**id**) |
| Rotacionar PIN | `rotatingPinFor` (**id**) |

Os dois últimos são **por id** em vez de lock de tela: o ADMIN pode trocar de
casa ou rotacionar o PIN de casas diferentes sem ficar bloqueado. Os 6 handlers
ganharam `try/catch/finally` (o `startTransition` não tinha — exceção de rede
deixava o botão travado sem volta). `useTransition`/`startTransition`
**removidos** do arquivo; não sobrou nenhum.

### R4 — `setFormError(null)` apagava erro válido do formulário

`runTaskTransition` usava `formError` para o erro da transição. Esse state é
renderizado **dentro do form de criação de tarefa**, que nasce colapsado — ou
 seja, o erro de uma transição de card nunca aparecia ali. E o
`setFormError(null)` do início de **toda** transição apagava um erro do form que
ainda era válido.

**Correção:** `runTaskTransition` não mexe mais em `formError` — o erro da
transição sai só pelo `toast.error`, que é o canal visível perto do card. A
limpeza do erro foi para `resetForm()`, que é onde ela pertence (o erro morre
junto com o form).

### Verificação
`npm run lint` ✓ (**0 warnings**) · `npm run typecheck` ✓ · `npm run build` ✓
(16 rotas). `houses-manager.tsx` +224/−? (o peso é a reindentação dos handlers),
`tasks-admin.tsx` +24/−? e `houses.ts` 46/45 — este último quase todo
reindentação: o diff real é a lista de rotas + 11 chamadas de uma linha.
Encoding dos 3 arquivos conferido (0 caracteres de substituição).

### Pontos de atenção
- **Toda rota nova que resolver contexto de casa entra em `HOUSE_CONTEXT_ROUTES`** — a omissão agora é estruturalmente impossível (não existe um segundo bloco para copiar errado). Quando uma tela nova passar a depender da casa ativa, o sintoma é "dados da casa anterior": a resposta é adicionar a rota **na lista**, não criar um bloco novo na action.
- **`formError` é do form de criação.** Não usar para erro de card/modal — cada um tem seu state (`depError`, `actionError`, `pointsPending`...) ou o toast.
- **R5 continua aberto:** os labels de carregamento em `tasks-admin.tsx` são por **card** e não por ação (um card mostra "Aprovando..." enquanto outro está em "Restaurando", porque o texto é fixo na seção). O `pendingIds` já é por id; falta rotular pela ação em voo.
- Web Push: ver a limitação de plataforma na seção de estado atual acima.

---

## Revisão do padrão de transição de tarefa — 3 problemas encontrados e corrigidos (concluído — testado em tela)

### Por que essa revisão aconteceu
Uma varredura dos últimos commits achou que o padrão de "rollback condicional" e o `router.refresh()` do caminho de erro **não faziam o que o texto dizia**. Nenhum `lint`/`typecheck`/`build` pega nada disso — é comportamento, não erro de tipo. E o sintoma é exatamente o que motivou a entrega original: **a tarefa voltava para a seção errada e só saía com F5**.

### 1. O predicado de rollback era indistinguível do dado novo (o mais grave)
O rollback só desfazia a tarefa se um **predicado** casasse (ex.: `item.status === 'APPROVED'`). O problema: numa colisão — que é exatamente o caso para onde os guards de transição existem — o **outro escritor grava o mesmo valor**, o Realtime entrega essa linha, o predicado casa, e o rollback aplica o `task` capturado no render (stale) por cima. O card voltava para uma seção que não existe mais, e o evento do Realtime **já tinha sido consumido**.

| Handler | A action falha porque… | O banco já tem | O rollback fazia |
|---|---|---|---|
| `handleApprove` | outro ADMIN aprovou | `APPROVED` | voltava para "Concluídas" |
| `handleAdminComplete` | outro concluiu | `APPROVED` **+ crédito feito** | voltava para "Pendentes" |
| `handleMarkNotDelivered` | outro marcou | `NOT_DELIVERED` **+ débito** | sumia o aviso de penalidade |
| `handleSetOnHold` | outro pausou | `ON_HOLD` | voltava para "Pendentes" |
| `handleRestore` | outro restaurou | `PENDING` | voltava para "Aprovadas" |

No `handleResolveExtension` era pior: com `approve === false` o predicado **degenerava** (as flags ficam iguais ao otimista), então o falso positivo virava a norma.

**Correção:** o "ainda é o valor do otimista" virou um **registro** — `optimisticIdsRef: Set<string>` com os ids cujo card está num valor que **só o otimista produziu**. O id sai do registro quando uma **linha real** chega (`onUpsert` do Realtime), quando a **prop** chega (efeito de sincronização) e no **`finally`** da transição. Isso resolve os 7 casos de uma vez e **elimina o 4º argumento** dos handlers (um a menos para acertar errado).

### 2. `router.refresh()` não fazia nada
`TasksAdmin`/`TasksDependent` são montados com `key={casa.id}` e **não havia nenhum `useEffect` sincronizando `initialTasks` → `tasks`**. Na mesma casa a key não muda, então o refresh re-renderiza o Server Component mas o `useState` do client component já montado **ignora** a prop nova. Ou seja: o `router.refresh()` do caminho de erro de rede **não reconcilia nada** — só o Realtime corrigia, e quando ele não entrega (o cenário do bug) a tela ficava errada até o F5.

**Correção:** efeito que faz `setTasks(initialTasks)` quando a prop chega, **pulado enquanto há valor otimista na tela** (nesse instante o refresh traria o estado anterior e sobrescreveria o card que acabou de mudar). Como o `finally` limpa o registro antes, o refresh pós-erro já entra.

### 3. Duplicação deixada pela resolução de um conflito
`comunicados-admin.tsx` ficou com o `upsertComunicado(res.data.comunicado)` **duas vezes** seguidas (com o comentário repetido) — o merge resolveu o conflito introduzi**ndo** código que não estava em nenhum dos dois pais. Inofensivo em comportamento, removido.

### Efeito colateral do ajuste 1
Otimista passou a ser uma **factory** (`() => Task`) em vez de um objeto pronto: pausar/restaurar calculam um prazo novo com `Date.now()`, e essa chamada na verdade rodava **durante o render** — o `react-hooks/purity` acusou como impure. Com a factory, ela é avaliada no clique, que é onde deve ser.

### Verificação
`npm run lint` ✓ (**0 warnings**) · `npm run typecheck` ✓ · `npm run build` ✓ (14 rotas). Nenhuma classe CSS nova.

### Pontos de atenção
- **Ao adicionar uma transição nova:** passe o otimista como **factory**, deixe o `runTaskTransition` marcar o id em `optimisticIdsRef` e **não** escreva um predicado de rollback.
- **A limpeza do registro no `finally` é o que garante a ordem** — o rollback roda ANTES dela (branches mutuamente exclusivos). Inverter quebra o rollback.
- **Ainda não corrigidos** (achados da mesma revisão): o Web Push não tem listener de `NOTIFICATION_CLICK` (`public/sw.js` — app fechado abre a casa errada); os labels de carregamento são por card e não por ação (R5 — ver a seção do R4 no topo).
- **~~Corrigido depois~~**: 7 actions de casa não revalidavam `/achievements` (P2) e `/dashboard/dependent`; `toLocaleString` em JSX sempre renderizado (`tasks-admin.tsx`, hydration mismatch — P3); `houses-manager.tsx` usava `startTransition(async …)` (P4). Os quatro estão detalhados na seção no topo do documento.

---

## Notificações de outra casa: chip no card e troca automática ao clicar (concluído — testado em tela, sem mudança de schema)

### O problema (não previsto nas regras do app)
- O **sino é global** (fica no header de todas as telas) e cada linha de `notifications` carrega a casa de origem (`house_id`). Com o ADMIN multi-casa, as notificações de **todas** as casas se misturam num painel só.
- Ao clicar, o sino fazia `router.push(item.link)`. O `link` é **relativo** (`/tasks`, `/rewards`, `/achievements`) e a página resolve pela **casa ativa** — então clicar na notificação da casa B enquanto a ativa é a A levava para a tela **da casa A**, onde a tarefa não estava. O `AGENTS.md` §3 previa "destinatário = o outro lado", mas nunca a ambiguidade de casa.

### O que foi feito
- **Chip de contexto antes do clique (a causa, não só o efeito):** cada notificação de **outra** casa ganha um chip com o nome dela (`House` + nome) ao lado do título. Sem isso o admin não tinha como saber onde estava clicando — a informação tem de chegar *antes* da decisão. Notificações da casa ativa ficam sem chip (o sino do dia a dia não é poluído).
- **Troca de casa antes de navegar:** `openItem` virou `async` e, quando `item.house_id !== activeHouseId`, chama **`selectHouse(item.house_id)`** e só então navega. Três detalhes obrigatórios:
  - **esperar o `selectHouse`** — o cookie é `httpOnly`; se o `push` rodar antes da gravação, o fetch do RSC ainda lê o cookie velho;
  - **`router.push(link)` + `router.refresh()`** — `push` para a **mesma** rota é no-op e não traz props novas; o `refresh` é o que faz a página renderizar a casa nova (é o caso `/tasks` → `/tasks`);
  - **falha do `selectHouse` → não navega** (o ADMIN pode ter saído daquela casa), apenas mostra o erro.
- **Aviso em toast**, não modal: o clique numa notificação já é um gesto informado pelo chip, e a troca é reversível — um modal só adicionaria atrito.
- **Guard por papel:** `isOtherHouse` só é verdade para o ADMIN. O dependente pertence a uma casa só, então nunca vê notificação de outra (e o layout dele passa só o `activeHouseId`, sem mapa de nomes).
- **Propagação das props** `activeHouseId` + `houseNames` (`house_id → nome`): `DashboardNav` só encaminha ao sino; os **5 call sites** passam os valores. `getAdminHouses(user.id)` entra no `Promise.all` das 3 páginas admin-aware e do layout admin — **custo zero de query**, porque `getActiveAdminHouse()` já chama `getAdminHouses()` por dentro e ambos são `React.cache`. O layout admin também passou a `Promise.all` (estava sequencial).
- **`selectHouse` agora revalida `/achievements`:** revalidava 4 rotas e `/achievements` não estava entre elas, apesar de ser uma das telas da nav — e é justamente para lá que a correção pode navegar.

### Verificação
`npm run lint` ✓ (**0 warnings**) · `npm run typecheck` ✓ · `npm run build` ✓ (14 rotas, `ƒ Proxy` ativo). Classes do chip conferidas **no CSS gerado**, como manda o `AGENTS.md` §2: `.bg-slate-200`, `.text-slate-600`, `.size-3` e as reutilizadas (`.inline-flex`, `.rounded-full`, `.px-2`, `.py-0.5`, `.text-xs`, `.font-medium`, `.gap-1`, `.shrink-0`) — todas presentes. **Testado em tela** pelo usuário com 2 casas.

### Pontos de atenção
- **Limitação aceita (verificada em tela):** há um **delay perceptível** quando o admin já está no mesmo endpoint do `link` (ex.: está em `/tasks` e clica numa notificação cujo link é `/tasks`) — o `router.push` é no-op e quem traz a tela nova é o `router.refresh()`, logo dá uma sensação de espera curta antes de o dado trocar. Irrelevante para o usuário agora; se incomodar depois, a saída é trocar a navegação por `router.replace` + refresh em um único passo.
- **O nome da casa vem de uma prop do servidor.** Se uma notificação chegar de uma casa que o ADMIN **não** controla mais (ex.: foi expulso), o chip **não** aparece (não há nome) e o clique mostra o erro do `selectHouse` sem navegar.
- **`houseNames` só é enviado ao ADMIN.** É por isso que o chip some sozinho quando o nome não existe, em vez de aparecer um id cru.
- **Não há filtro por casa no sino** (decisão consciente): as notificações continuam misturadas, o que preserva a visibilidade de todas as casas de uma vez — filtrar criaria o buraco de o ADMIN só ver alertas da casa ativa.
- **`selectHouse` sem `data`:** retorna só `{ ok: true }`. O nome da casa nova vem do `houseNames` já em mãos no client, então não foi preciso mudar a assinatura da action.
- Requer deploy para valer online.

---

## Feedback imediato em todas as transições de tarefa + guard obrigatório (implementado — testado em tela, sem mudança de schema)

### Diagnóstico: por que "Aprovar" demorava
O botão ficava sem feedback até o fim, e a causa **não era uma só**:
1. **O feedback já estava escrito no JSX, mas era código morto.** Os botões usavam `pending` do `useTransition` (`{pending ? 'Aprovando...' : ...}`, `disabled={pending}`) — e `startTransition(async …)` **nunca marca `isPending`** (o React não rastreia a Promise devolvida pelo callback). `isPending` não era usado em **nenhum** lugar do projeto: todo `disabled={pending}` era inerte, e os labels nunca apareciam.
2. **A action fazia ~20-28 round-trips sequenciais**, sem nenhum `Promise.all`: `auth.getUser()` (HTTP GoTrue), sessão, casa, `house_settings` do decaimento, status, saldo, `notifyUser`, **HTTP de Web Push**, e as 2 chamadas de `registerAchievementProgress` (que repetem um ciclo de ~6 queries cada). Nada disso tinha a ver com o que o usuário via.
3. **Consequência prática:** o update otimista existia, mas rodava **depois** do `await`, então a tela não mudava até o servidor responder.

### O que foi feito — padrão único de transição
- **`runTaskTransition(task, buildOptimistic, run, options)`** (`tasks-admin.tsx`) encapsula os 5 passos: trava o botão da tarefa (id em `pendingIds: Set<string>`) → **aplica o otimista ANTES do `await`** → aguarda a action → em erro, **rollback condicional** → destrava no `finally`. Os **7 handlers** de transição (aprovar, concluir e creditar, desaprovar, marcar não entregue, pausa/reativação, restaurar, resolver adiamento) viraram uma chamada de 4-6 linhas cada. O otimista entra como **factory** (`() => Task`) e não como objeto pronto: pausa/restauração calculam um prazo novo com `Date.now()`, o que a regra de pureza do React proíbe em tempo de render.
- **Rollback condicional por um REGISTRO, e não snapshot.** O padrão de `achievements-admin.tsx` usa `const snapshot = progress`, mas ele só é seguro porque ali a ação é travada e é uma por vez. Como aqui o ADMIN pode agir em vários cards ao mesmo tempo, um snapshot desfaria também a atualização otimista de outra tarefa — então o rollback é **por id**, e só desfaz o card que ainda está num valor produzido pelo otimista. O "ainda é o valor do otimista" é um **registro** (`optimisticIdsRef: Set<string>`), não um predicado — ver a seção de revisão no topo, que explica por que o predicado por status não servia. O id sai do registro quando uma **linha real** chega (`onUpsert` do Realtime), quando a **prop** chega (efeito de sincronização) e no **`finally`** da transição.
- **Erro de rede reconcilia:** o `catch` faz rollback **e** `router.refresh()`, porque é ambíguo se o servidor gravou e só a resposta não chegou. Isso só funciona por causa do efeito de sincronização da prop (ver a seção de revisão).
- **Dependente no mesmo padrão:** `handleComplete` e `handleRequestExtension` migrados; o `useTransition` foi **removido** do arquivo. O submit do pedido usa um flag `sendingExtension` (o Modal é de instância única e o `setExtendingTask(null)` do sucesso desmonta o botão).
- **`pending`/`startTransition` sobreviveram** apenas nos **3 botões do formulário de criação** do admin (linhas 867, 876, 896), onde a ação é de escopo único — lá o `startTransition` faz sentido. **Todos os 9 botões de transição de card foram migrados** para `pendingIds.has(task.id)` (Aprovar, Concluir e creditar, Desaprovar, Marcar como não entregue, Colocar em espera, Voltar para pendente, Aprovar/Rejeitar adiamento, Restaurar), cada um com seu label de carregamento.

### Guard obrigatório em toda escrita em `tasks` (a parte que corrigiu bug real)
Varredura de todas as escritas em `tasks` — **as 15 agora têm guard**:
- **`completeTask` era a única transição sem guard.** Validava o status numa **leitura separada** e gravava `status: 'COMPLETED'` com `.eq('id')` puro: se o ADMIN aprovasse entre as duas, o `COMPLETED` caía **por cima** de um `APPROVED` já creditado e a tarefa voltava a "aguardando aprovação". Ganhou `.in('status', ['PENDING','IN_PROGRESS'])`.
- **`requestTaskExtension` também não tinha** — o pedido era gravado sem conferir nada, então se o ADMIN pausasse/aprovasse no mesmo instante, o pedido era recriado numa tarefa que a pausa **descarta de propósito** (ADR-0018). Ganhou `.in('status', …)` + `.eq('extension_requested', false)` (que também elimina pedido duplicado entre dispositivos).
- **`updateTask` não tinha** e pode **mudar status** (reabertura de `NOT_DELIVERED`). Sem guard, o `DebouncedField` gravava título por cima de uma tarefa recém-concluída — o que a regra proíbe. Ganhou `.in('status', [4 status editáveis])`.
- **3 rollbacks sem guard** (`approveTask`, `markTaskNotDelivered`, `adminCompleteTask`): revertiam o status com `.eq('id')` puro e podiam sobrescrever o que outro ADMIN mexeu na janela do crédito. Ganharam `.eq('status', <o que a chamada gravou>)`.
- **`profiles.points` (crédito/débito) tinha read-modify-write sem guard** — duas aprovações no mesmo intervalo podiam **perder um crédito**. O `adjustPoints` ganhou update com `.eq('points', valor lido)` + 1 retry relendo (mesmo padrão de `incrementDependentStat`); `approveTask`/`adminCompleteTask` passaram a usá-lo, o que **removeu ~46 linhas duplicadas**. O retorno virou `'credited' | 'not_found' | 'failed'` para preservar as duas mensagens de erro distintas.

### Verificação
`npm run lint` ✓ (**0 warnings**) · `npm run typecheck` ✓ · `npm run build` ✓ (14 rotas). **Testado em tela** pelo usuário, inclusive no cenário de colisão dependente⇄admin.

### Pontos de atenção
- **A latência real (~2-4s) continua.** O que mudou foi a **percepção** (resposta no mesmo quadro). O caminho crítico ainda tem ~5-6 round-trips; a correção de verdade seria **`after()` do Next 16** (tirar notificação, push e conquistas para fora da resposta), estável e com `waitUntil` na Vercel — **decidido por ora não fazer**.
- **O guard do push HTTP segue no caminho crítico**, apesar do comentário "não bloqueia" em `notifications.ts`: o `await sendPushToUser(...)` bloqueia a action (é a chamada mais lenta: 200ms-3s).
- **`isPending` nunca foi tratado no projeto inteiro** — se surgir `startTransition(async …)` novo, ele **não** dá feedback. Usar `runTaskTransition` (ou o `void (async …)` dos handlers do dependente).
- **Não reintroduzir `disabled={pending}`** nos cards de tarefa: além de inerte, o `pending` é **global de tela** e bloquearia os outros cards. O que se quer é por id.
- Requer deploy para valer online.

---

## Delay do feedback de edição agora é uma constante ajustável (concluído — testado em tela, sem mudança de schema)

### O que foi feito
- **Ponto de partida:** o botão de ação do card ("Aprovar Tarefa e Creditar") é escondido durante a edição de campo e no lugar aparece "⏳ Salvando alterações..." → "✓ Alterações salvas" (ver a seção histórica abaixo). A janela entre o "✓ Alterações salvas" e o botão voltar era um **literal solto** no `setTimeout`, com um comentário justificando a escolha.
- **O que mudou:**
  - O literal virou a constante **`SAVED_FEEDBACK_MS`**, declarada no topo do `debounced-field.tsx`, com o porquê no JSDoc. É o **único** ponto a mexer para mudar a janela, em qualquer direção — para menos ou para mais.
  - A janela encolheu porque o salvamento ficou rápido com as correções recentes de transição (feedback imediato e guard de transição no servidor): o valor anterior só fazia sentido com o salvamento lento de antes.
- **Bug preexistente que a janela curta revelou:** o `setTimeout` do "voltar para idle" ficava **fora de qualquer ref** (ao contrário do `timerRef`, que segura o debounce e é limpo no unmount). Com janela longa ele raramente aparecia; encurtando, virou frequente: retocar o campo logo após salvar deixava o **timer velho derrubar o feedback do salvamento novo** — o botão voltava segundos antes do previsto. Agora o timer vive numa **ref própria** (`savedTimerRef`) e o anterior é **cancelado** antes de agendar o próximo, além de ser limpo no unmount.
- **O que não mudou:** o ciclo `saving → saved → idle` é o mesmo, o caminho de **erro** continua zerando o estado imediatamente (sem esperar a janela), e `tasks-admin.tsx` não foi tocado — nem o `savingStatuses`, nem o ternário que remove o botão do DOM, nem os `onSavingStatusChange` dos 4 campos.

### Verificação
`npm run lint` ✓ (**0 warnings**) · `npm run typecheck` ✓ · `npm run build` ✓ (14 rotas, `ƒ Proxy` ativo). Nenhuma classe CSS nova, então dispensa a conferência no bundle do `AGENTS.md` §2. **Testado em tela** pelo usuário, incluindo o caso de retocar o campo dentro da janela (o feedback acompanha cada ciclo corretamente).

### Pontos de atenção
- **Para mudar a janela, mexer só em `SAVED_FEEDBACK_MS`** (topo do `debounced-field.tsx`) — nunca no `setTimeout` inline, que fica logo abaixo e depende da ref.
- **Não remover o `clearTimeout` da `savedTimerRef`**: ele só é invisível com janela longa. Encurtar a janela sem ele traz de volta o bug do timer antigo derrubando o feedback novo.
- O efeito colateral pretendido de encurtar: o botão de ação volta mais cedo, o que é o desejado (o ADMIN não fica impedido de aprovar por causa de um texto na tela). Se voltar cedo demais em uso real, é só aumentar a constante.

---

## Rodapé ancorado na base do card — conquistas do dependente (concluído — testado em tela, sem mudança de schema)

### O que foi feito
- **Pedido:** na tela `/achievements` do DEPENDENTE, o botão **"Resgatar"** (com a barra de progresso e a pill de pontos) deveria ficar **sempre na parte inferior do seu respectivo card**, e não logo abaixo do texto.
- **Sintoma:** o card era uma sequência solta de blocos — ícone/título + chip de nível, descrição, pill `+N pts`, barra de progresso e botão — colados pelo `gap-3`. Como o grid **não tem `items-start`** (`achievements-dependent.tsx:153`), o card estica até a altura da linha (`align-items: stretch`), mas o conteúdo ficava todo agrupado no topo: o botão aparecia no meio do card e sobrava um **vão vazio embaixo dele**.
- **Correção:** os três blocos de "metadado + ação" (pill de pontos + "Desbloqueada!", barra de progresso com `N / target` e o botão) foram agrupados em um **rodapé** único — `<div className="mt-auto flex flex-col gap-2">` — logo abaixo da descrição. O `Card` já era `flex flex-col`, então nada mais precisa mudar no card: o `mt-auto` empurra o rodapé para a base. O `gap-2` interno substitui o `gap-3` que existia entre os blocos soltos, então o rodapé fica um pouco mais compacto.
- **O botão continua no mesmo lugar do fluxo** (`claimable` → botão, senão `claimed` → "Conquista resgatada 🎉", senão nada) e o wrapper do `useMemo`/`Realtime`/`handleClaim` não foi tocado — é mudança **de apresentação**, não de estado nem de regra.

### A distinção que o `mt-auto` exige (importante para quem ler o código)
O `AGENTS.md` §2 **proíbe** `mt-auto`/`flex-1` em `CardContent`/wrapper de botão — mas aquela regra é sobre **forçar altura igual entre vizinhos** (o truque que desfazia a regra do "card não herda a altura do vizinho"). Aqui o `mt-auto` serve a outro propósito: **ancorar o rodapé DENTRO do próprio card**, um padrão de card com footer. Não há cards vizinhos sendo igualados — cada card ancora o seu próprio rodapé. O comentário no JSX deixa isso explícito para a regra não ser lida como violação.

Além disso o `mt-auto` é **inofensivo quando o card não estica**: sem espaço extra ele vira `0` e o `gap-3` do pai segue dando o respiro. Então o mesmo markup funciona nos dois regimes (card com altura natural ou card esticado pelo grid).

### Verificação
`npm run lint` ✓ (**0 warnings**) · `npm run typecheck` ✓ · `npm run build` ✓ (14 rotas, `ƒ Proxy` ativo). Classes conferidas **no CSS gerado**, como manda o `AGENTS.md` §2: `.mt-auto{margin-top:auto}` ✓ e `.gap-2{gap:calc(var(--spacing) * 2)}` ✓. Diff real ignorando indentação: só **2 trechos** (abrir o rodapé + fechar) — o resto da inserção é a reindentação de quem entra no wrapper.

### Pontos de atenção
- **Bônus do grid sem `items-start`:** como os cards da mesma linha já esticam para a mesma altura, os **botões de uma mesma linha agora terminam na mesma altura** (antes cada um ficava na altura do próprio conteúdo). É o alinhamento que se esperava.
- **O card da conquista secreta ficou como estava** (`achievements-dependent.tsx:169-189`): é um placeholder sem botão/progresso, então não tem rodapé para ancorar. Se ele esticar na linha, o texto fica no topo e sobra espaço embaixo — dá para ancorar também, se quiser consistência visual.
- **Conquistas ainda NÃO migrou para masonry** (`CardColumns`): continua `grid gap-4 sm:grid-cols-2 xl:grid-cols-3`. Não foi tocado porque o pedido era o rodapé. **Se migrar para masonry no futuro, o `mt-auto` deixa de ter efeito** (em multicol o card já tem a altura do próprio conteúdo, então o rodapé fica na base naturalmente) — não vai quebrar nada, só deixa de ser necessário.
- Testado em tela pelo usuário, sem inconsistência visual conhecida.
- Requer deploy para valer online.

---

## Masonry em Recompensas (dependente) e Configurações — o primitivo replicado nas telas restantes (concluído — sem mudança de schema)

### O que foi feito
- **Continuidade do masonry de Tarefas** (seção abaixo): o mesmo primitivo `src/components/ui/card-columns.tsx` foi replicado nas duas telas seguintes — sem JS, sem markup novo, só a troca do wrapper.
- **Loja de recompensas do DEPENDENTE (`rewards-dependent.tsx`):** a grade `grid gap-3 sm:grid-cols-2 sm:items-start xl:grid-cols-3` da seção "Loja de recompensas" virou `<CardColumns className="gap-x-3 sm:columns-2 xl:columns-3 [&>*]:mb-3">`. **Números de colunas preservados** (1 no mobile, 2 em `sm:`, 3 em `xl:`) — muda o empacotamento, não a densidade. **O heading, a busca, o form de sugestão e o `EmptyState` já estavam fora** do container de cards (ramo do ternário), então não houve o problema do item de largura total preso na 1ª coluna. É aqui que o card é **mais dinâmico**: a altura varia por **imagem + descrição de comprimento variável**.
- **Configurações do ADMIN (`settings-admin.tsx`):** o container `grid gap-6 lg:grid-cols-2 lg:items-start` virou `flex flex-col gap-6` + `<CardColumns className="gap-x-6 lg:columns-2 [&>*]:mb-6">` nos **8 cards** (Economia de pontos, Mensagem rápida, Prazos de tarefas, Adiamento de tarefas, Notificações, Decaimento de pontos, Limites de tarefas, Fuso horário).
  - **O banner azul de largura total saiu do multicol** (e com ele o `lg:col-span-2`): em multicol não existe item de largura total, então ele ficaria preso na 1ª coluna. É a **diferença estrutural** em relação às outras telas — aqui havia um item de largura total, não só heading.
  - **Grades internas dos formulários intactas:** os `sm:grid-cols-2`/`sm:grid-cols-3` dentro dos `CardContent` (Economia, Mensagem rápida, Notificações, Limites) são grids de **campo de formulário**, não listas de cards — não foram tocados.
  - **Espaçamento 6 preservado:** o `gap-6` (1.5rem) foi dividido em `gap-x-6` (horizontal) + `[&>*]:mb-6` (vertical, no filho) — mesma métrica, então o respiro entre cards não muda.
- **Efeito colateral:** `sm:items-start` (loja) e `lg:items-start` (Configurações) foram **removidos** — em multicol cada card já ocupa só a altura do próprio conteúdo. Diff real de cada arquivo **ignorando indentação**: `rewards-dependent.tsx` **3 linhas inseridas / 2 removidas**, `settings-admin.tsx` **5 / 2**.

### Verificação
`npm run lint` ✓ (**0 warnings**) · `npm run typecheck` ✓ · `npm run build` ✓ (14 rotas, `ƒ Proxy` ativo). Classes conferidas **no CSS gerado** (`.next/static/chunks/*.css`), como manda o `AGENTS.md` §2 — `rewards-dependent.tsx`: `.sm\:columns-2{columns:2}`, `.xl\:columns-3{columns:3}`, `.gap-x-3`, `.\[\&\>\*\]\:break-inside-avoid>*{break-inside:avoid}` e `.\[\&\>\*\]\:mb-3>*{margin-bottom:…}`; `settings-admin.tsx`: `.lg\:columns-2{columns:2}`, `.gap-x-6{column-gap:calc(var(--spacing) * 6)}` e `.\[\&\>\*\]\:mb-6>*{margin-bottom:calc(var(--spacing) * 6)}` — todas presentes (`.columns-1` vem do primitivo). As duas transformações foram inspecionadas linha a linha (banner/heading fora, `<CardColumns>` abrindo e fechando no lugar certo, ternário da loja com `EmptyState` preservado).

### Pontos de atenção
- **A ordem de leitura por coluna também vale nestas telas:** na loja a 1ª linha mostra o card 1 e o ~3; em Configurações, card 1, 3 e 5. Em Configurações a ordem é mais semântica (é um menu de blocos) — se a ordem em coluna incomodar mais que o vão que ela elimina, o grid com `items-start` já resolvia o vão sem trocar a ordem de leitura.
- **Em Configurações o item de largura total é o banner** (não um heading): qualquer coisa de largura total que entrar naquela tela precisa ficar **fora** do `CardColumns`.
- **Não reintroduzir `items-start` junto com `CardColumns`** — em multicol não há `align-items: stretch`, então a classe é inofensiva mas enganosa.
- **Indentação:** os 8 cards de Configurações **não foram reindentados** (ficaram 2 níveis "faltando" em relação ao wrapper) para manter o diff revisável — é puramente cosmético e nenhum linter do projeto cobra indentação (há **8** `<div className="flex justify-end">` pré-existentes na coluna 0, um por card, deixados como estão).
- **Pendente do mesmo padrão:** Conquistas (`achievements-admin.tsx`, `achievements-dependent.tsx`) e Comunicados (`comunicados-admin.tsx`), que ainda usam `items-start`.
- Requer deploy para valer online.

---

## Masonry nas listas de cards de TAREFAS — o vão vazio entre cards (piloto validado e replicado no ADMIN)

### O que foi feito
- **Sintoma (o motivo de ter ido além do `items-start`):** corrigir o card esticado resolvia a altura, mas o **vão vazio embaixo continuava visível** — o CSS Grid alinha as linhas, então o card seguinte só começa na linha de baixo, nunca "sobe" para o espaço deixado pelo vizinho mais alto. Em "Suas tarefas" (cards de altura variável, com botão "Pedir mais tempo" só em alguns) isso ocupa muito espaço vazio na tela larga.
- **O que foi aplicado:** as **3 seções de `tasks-dependent.tsx`** (Suas tarefas / Aguardando aprovação / Concluídas) e as **4 seções de `tasks-admin.tsx`** (Pendentes / Em espera / Concluídas — aguardando aprovação / Aprovadas) deixaram de ser grid. O `<section>` passou a `flex flex-col gap-3` e os cards vão para o primitivo **`src/components/ui/card-columns.tsx`** (`columns-1` + `[&>*]:break-inside-avoid`), com o resto no call site: `gap-x-3 xl:columns-2 [&>*]:mb-3`.
  - **Heading e `EmptyState` saíram do container de colunas** (e com eles o `xl:col-span-2`): em multicol **não existe item de largura total**, então o título e o estado vazio ficariam presos na 1ª coluna. Agora ficam acima, em largura total, com o respiro do `gap-3` do `<section>`. As 4 seções do ADMIN têm o mesmo desenho (2 delas com `EmptyState`, 2 condicionais a `.length > 0`).
  - **Espaçamento vertical por `[&>*]:mb-3` no filho**, nunca por `row-gap`/`gap` vertical, que não é honrado de forma confiável em multicol.
  - **Efeito colateral:** a varredura das seções alteradas não encontrou mais `items-start`/`xl:col-span-2`/`xl:grid-cols-2` nelas — as classes ficaram sem uso nesses arquivos. **Os `md:col-span-2`/`md:grid-cols-2` do formulário de tarefa não foram tocados** (são grid de campo de formulário, não lista de cards).
- **Por que CSS puro e não JS:** medição com `ResizeObserver` + posicionamento absoluto exigiria duplicar a fonte de verdade dos cards em estado do React, roda em cada `router.refresh()`/expansão e traz risco de sobreposição/flash. O multicol resolve em CSS, sem hydration e sem custo de runtime. **Masonry nativo** (`grid-lanes`/`item-flow: collapse`) foi verificado e está **fora de conta**: não é Baseline (Chrome/Edge atrás de flag, Firefox por `about:config`, só em Technology Preview no Safari). Quando vier, dá para trocar por `@supports` **sem mudar o markup** — por isso o primitivo é a única coisa que os call sites conhecem.

### Verificação
`npm run lint` ✓ (**0 warnings**) · `npm run typecheck` ✓ · `npm run build` ✓ (14 rotas, `ƒ Proxy` ativo). Classes conferidas **no CSS gerado** (`.next/static/chunks/*.css`), como manda o `AGENTS.md` §2: `.columns-1{columns:1}`, `.xl\:columns-2{columns:2}`, `.gap-x-3{column-gap:…}`, `.\[\&\>\*\]\:break-inside-avoid>*{break-inside:avoid}` e `.\[\&\>\*\]\:mb-3>*{margin-bottom:…}` — todas presentes. As transformações foram inspecionadas linha a linha (heading fora, `<CardColumns>` abrindo/fechando no lugar certo, ternário das seções com `EmptyState` preservado); o diff real de `tasks-admin.tsx` ignorando indentação é de 21 linhas inseridas / 12 removidas — o resto é só a reindentação inevitável de quem entra no wrapper.

### Pontos de atenção
- **A ordem de leitura passa a ser por coluna.** Com colunas balanceadas, a 1ª linha mostra o card 1 e o ~card 4 (não 1 e 2). Foi uma decisão consciente do usuário, **validada na tela** — não é bug.
- **Não é rolagem infinita:** o balanceamento de colunas define a altura da seção pela coluna mais alta; com muitos cards, ela é a que mais cresce.
- **Risco conhecido (o principal a validar na tela):** `break-inside: avoid` impede a quebra de um card entre colunas, mas um card **muito** alto (descrição longa + expandido) pode ultrapassar a altura da coluna. No mobile é 1 coluna, então não há fragmentação.
- **Escopo:** ~~vale para **Tarefas (ADMIN e DEPENDENTE)**. Configurações, Recompensas, Conquistas e Comunicados seguem com `items-start`~~ — **superado**: Configurações e a loja de Recompensas do dependente também migraram para `CardColumns` (seção no topo). Restam **Conquistas** e **Comunicados** com `items-start`; o caminho é replicar o primitivo (mudança local, sem JS).
- Requer deploy para valer online.

---

## Cards com a altura do próprio conteúdo — card vizinho não herda a altura do outro (concluído — sem mudança de schema)

### O que foi feito
- **Sintoma relatado:** em Configurações, Tarefas e Recompensas, ao expandir um card (o de tarefa aberta do ADMIN, um card de configuração mais alto etc.) **o card vizinho crescia junto**, ficando com um vão vazio embaixo.
- **Causa raiz:** `align-items: stretch`, que é o **padrão do CSS Grid**. Todo item de uma linha de grid ocupa a altura da linha, e a altura da linha é a do item mais alto. Ou seja, não era a `Card` esticando — era a grade. Isso atinge **qualquer** card que vire item de grid, e é por isso que aparecia nas três telas ao mesmo tempo.
- **Correção:** `items-start` **no breakpoint em que a grade ganha colunas** — `lg:items-start` na grade de Configurações, `xl:items-start` nas seções de 2 colunas de Tarefas/Recompensas e `sm:items-start` na loja do dependente (3 colunas). Cada card passa a ter a altura do seu próprio conteúdo, mantendo a **largura** que já tinha (só o eixo vertical muda). Abaixo do breakpoint a grade tem 1 coluna, então `items-start` é inofensivo — e por isso ele é escopado no breakpoint, seguindo o mesmo padrão do `md:items-start` que já existia no form de tarefas.
- **Efeito colateral bem-vindo:** os botões "Salvar" de Configurações voltaram a ser simplesmente o **último filho** do `CardContent`. O `flex-1` no `CardContent` e o `mt-auto` no wrapper do botão (tricks da entrega anterior, que forçavam altura igual para alinhar os botões) foram **removidos** — com o card ajustando ao conteúdo, eles não tinham mais efeito, e mantê-los só voltaria a induzir quem lê o código a "consertar" a altura de um jeito que desfaz esta regra.

### Verificação
`npm run lint` ✓ (**0 warnings**) · `npm run typecheck` ✓ · `npm run build` ✓. Como a regra do projeto é não confiar no build para classe de Tailwind, as 4 variantes foram conferidas **no CSS gerado** (`.next/static/chunks/*.css`): `.items-start`, `.sm\:items-start`, `.lg\:items-start` e `.xl\:items-start` presentes, todas com `align-items:flex-start`. Varredura confirmou que `mt-auto`/`flex-1` sobraram só em `settings-admin.tsx` e **nenhum** restou ligado à altura do card.

### Pontos de atenção
- **Regra: card lado a lado não herda altura do vizinho.** Se um card novo for posto em grade com colunas, a grade precisa de `items-start` no breakpoint das colunas — sem isso o bug volta, e `lint`/`typecheck`/`build` **não** reclamam (é layout, não erro).
- **Não reintroduzir `flex-1`/`mt-auto` como truque de alinhamento** em `CardContent`/wrapper de botão: eles só fazem sentido com altura igual entre vizinhos, que é exatamente o que esta mudança eliminou.
- **Mesmo padrão, ainda NÃO aplicado, fora do que foi pedido:** as telas de **Conquistas** (`achievements-admin.tsx` e `achievements-dependent.tsx`) e **Comunicados** (`comunicados-admin.tsx`) também têm grades de cards com colunas e sufferiam do mesmo alongamento. Ficaram de fora porque o pedido foi Configurações/Tarefas/Recompensas — e Configurações/Recompensas já migraram para `CardColumns` (seção no topo), então o caminho lá é **replicar o primitivo**, não acrescentar `items-start`.
- Requer deploy para valer online.

---

## Espaçamento das telas internas do ADMIN e ajustes na tela de Configurações (concluído — sem mudança de schema)

### O que foi feito
- **Causa do "recuo em relação à navbar" em Configurações e Comunicados: padding dobrado.** O `DashboardNav` é `fixed` com `h-16` (4rem), e o recuo correto vem do container do **layout** (`app/dashboard/admin/layout.tsx`, `pt-20`/`md:pt-24`). As páginas `/dashboard/admin/settings` e `/dashboard/admin/comunicados` **aninhadas nesse layout** traziam um segundo container com o mesmo padding — então o topo somava `80px + 80px` (mobile) e `96px + 96px` (desktop), e o conteúdo ficava ~96px abaixo da navbar em vez de ~16px. Removido o container redundante das duas páginas: agora elas só têm `<div className="flex flex-col gap-6">`, **igual a Visão geral** (`/dashboard/admin/page.tsx`) e a página de Casas, que já estavam no padrão.
  - **Regra:** container com `p-4 pt-20 pb-24 md:p-6 md:pt-24 md:pb-6` só existe na **raiz** de uma rota (`/tasks`, `/rewards`, `/achievements` e os dois `layout.tsx` do dashboard). Página aninhada dentro de um layout **não** repete o padding — o layout já resolveu isso.
- **Cards com a altura do próprio conteúdo (correção seguinte — ver seção abaixo).** Hoje a regra é `items-start`; o `flex-1`/`mt-auto` que alinhava os botões "Salvar" foi removido.
- **Fuso: lista rolável com a diferença de horas visível.** O `<select>` nativo virou um **dropdown próprio** (`TimezoneSelect`) — são 19 fusos e a lista precisa mostrar a diferença de cada um em relação ao UTC (o nome da cidade sozinho não diz isso, e é o offset que torna a escolha visível). Cada opção mostra o rótulo **e o offset** (`Recife · UTC-03:00`, `Manaus · UTC-04:00`, `UTC`, `Lisboa · UTC+01:00`). Fecha no `Esc` e ao clicar fora, com `role="combobox"`/`listbox` + `aria-controls`/`aria-expanded`.
  - **A lista é renderizada em portal (`document.body`) com `position: fixed`**, e não dentro do card. Dois motivos: a primitiva `Card` tem `overflow-hidden` (para o raio dos cantos e a imagem de topo), então uma lista `absolute` dentro dela era **recortada pelos limites do card** — nem abrir para cima resolveria; e being aninhada, ela ainda era limitada pelo fim da página.
  - **Posicionamento calculado na abertura:** a lista abre **para baixo** quando há espaço e **para cima** quando não há (trocando de lado conforme o espaço real), com a altura máxima limitada ao que sobrou — assim nunca invade a barra de navegação inferior. Reposiciona em `scroll`/`resize` enquanto aberta. Com `fixed`, "abrir para cima" é ancorar `bottom` (só `top` cresceria para baixo).
  - **A altura é expressa em número de itens, não em pixel solto:** as constantes `TZ_OPTION_HEIGHT` (56px) e `TZ_VISIBLE_ITEMS` (5) no próprio componente — 5 × 56 = 280px. Com `max-h` fixo a contagem mudava conforme a fonte que o navegador aplica (apareciam 3 em telas com fonte maior), porque a altura real do item varia.
  - **Os offsets são calculados no servidor** (`houseTimezoneOptions(now)` em `src/utils/timezone.ts`) e repassados por prop, junto com o "Agora na casa: UTC-03:00": calcular offset via `Intl` **durante o render do client** criaria risco de hydration mismatch.

### Verificação
`npm run lint` ✓ (**0 warnings** — a regra `jsx-a11y/role-has-required-aria-props` exigiu `aria-controls` no combobox) · `npm run typecheck` ✓ · `npm run build` ✓ (14 rotas). Varredura confirmando que **nenhuma página aninhada** em `app/dashboard/**` tem mais `pt-20`/`pt-24`/`pb-24` (só `achievements`, `tasks`, `rewards` e os dois `layout.tsx` mantêm, que é o padrão). Classes novas conferidas no CSS gerado (`max-h-64`, `overflow-y-auto`, `rotate-180`, `mt-auto`, `flex-1`, `z-30`).

### Pontos de atenção
- **Não reintroduzir container com padding em página aninhada** — é a causa raiz do desalinhamento com a navbar. Se uma página nova do dashboard precisar de respiro, o espaço já vem do layout.
- O dropdown do fuso é uma lista customizada em **portal** (não `<select>` nativo): se um dia ele for replicado, manter o `Escape`/clique-fora, o posicionamento recalculado (para baixo ou para cima) e os papéis de ARIA. E atenção ao par `TZ_OPTION_HEIGHT`/`TZ_VISIBLE_ITEMS` — a altura da lista é derivada dos dois.
- Testado pelo usuário: **sem inconsistência visual e sem bug** nestas telas até o momento.
- Requer deploy para valer online.

---

## Limite de adiamentos por tarefa + fuso visível (implementado — SQL aplicado no banco)

### O que foi implementado
- **Novo campo `maxExtensions` na chave `extension_rules`** (0 = ilimitado, **default preserva o comportamento atual**) no card "Adiamento de tarefas". Limita quantas vezes o prazo da **mesma tarefa** pode ser esticado.
- **Nova coluna `tasks.extension_count`** — não existia histórico: `extension_requested`/`extension_reason` são flags do pedido **atual** (limpam quando o pedido é resolvido), então não dava para saber quantos adiamentos uma tarefa já teve. Tarefas existentes nascem em `0` — não há como saber o histórico e inventar seria pior que recomeçar (a regra vale daqui pra frente, e a dica da tela diz isso).
- **O contador soma na APROVAÇÃO** (`resolveTaskExtension`), não no pedido: **recusar não estica prazo** e não pode consumir o orçamento do dependente. **Não contam**: editar o prazo direto no card, `restoreTask` e a reativação de `ON_HOLD` — todos dão prazo novo, mas são decisão do ADMIN (que sempre pode mudar o prazo direto).
- **A trava fica no pedido do dependente** (`requestTaskExtension`), com mensagem acionável (*"Esta tarefa já teve 2 adiamento(s) e o limite da casa é 3."*). O ADMIN continua podendo aprovar um pedido feito **antes** de a casa baixar o limite.
- **Bug corrigido no mesmo caminho — corrida de duplo clique em "Aprovar adiamento":** `resolveTaskExtension` fazia `update().eq('id', taskId)` **sem guarda de estado**, então dois cliques rápidos liam o pedido pendente e aplicavam o adiamento **duas vezes** (o que também somaria o contador duas vezes). Ganhou `.eq('extension_requested', true)` — a mesma defesa de transição guardada do resto do app — e "0 linhas" vira *"Este pedido de adiamento já foi resolvido por outra pessoa."*
- **Fuso ficou visível:** o card "Fuso horário" agora mostra **"Agora na casa: UTC-03:00"**. O `<select>` só mostra o nome da cidade, então o offset é o que muda de imediato ao trocar o fuso. O offset é calculado **no servidor** (`formatZonedOffset`) e repassado como **prop string** — texto estável, sem risco de hydration mismatch.
- **UI:** o banner do pedido de adiamento mostra o consumo (*"Esta tarefa já teve N de M adiamento(s) da casa"*) só quando há limite, e o update otimista já soma o contador na hora (sem esperar o `router.refresh()`).

### SQL aplicado no banco
**Já aplicado no Supabase e confirmado por probe** (`select extension_count from tasks` responde sem erro, com `0` nas tarefas existentes). Arquivo completo em `docs/sql/task_extension_count.sql` — registro do que foi rodado:
```sql
-- docs/sql/task_extension_count.sql (rodar no SQL Editor do Supabase):
alter table public.tasks add column if not exists extension_count int not null default 0;
alter table public.tasks drop constraint if exists tasks_extension_count_non_negative;
alter table public.tasks add constraint tasks_extension_count_non_negative check (extension_count >= 0);
```

### Verificação
`npm run lint` ✓ (**0 warnings**) · `npm run typecheck` ✓ · `npm run build` ✓ (14 rotas). Módulos reais executados com `node --experimental-strip-types` (loader temporário fora do repo): **14 casos de `formatZonedOffset`** — Recife/São Paulo/Belém (−03:00), Manaus (−04:00), Noronha (−02:00), `UTC`, Kolkata (+05:30, **meia hora**), Tóquio (+09:00), Lisboa +00:00/+01:00 conforme o DST e Santiago −03:00/−04:00 na estação correta do hemisfério sul. **20 casos de `maxExtensions`** — 0/1/3/99 aceitos, −1/100/fracionário/string reprovados, e as fronteiras da trava (0 = ilimitado nunca barra; 3 de 3 barra; 3 de 1 com limite já baixado barra). Classe do campo novo conferida no CSS gerado (`sm:max-w-xs`).

### Pontos de atenção
- **Nada pendente:** SQL aplicado e verificado por probe (`extension_count` responde, com `0` nas tarefas existentes), e a feature testada ponta a ponta (pedir → aprovar → contador sobe → trava no limite → remover/resetar contagem).
- **A regra é prospectiva:** tarefas com adiamentos anteriores a esta mudança começam em 0.
- **Baixar o limite vale na hora**, inclusive para tarefas que já passaram do novo teto (elas deixam de aceitar novo pedido).
- **Não é um teto global:** o limite é por tarefa e por casa; não existe "total de adiamentos da casa por semana".
- O limite é **só no caminho do pedido**. Editar o prazo direto no card continua possível de propósito (ver decisão 4 no ADR).

---

## Fuso horário por casa — e fim de um bug de 34% no agendamento dos comunicados (implementado — sem mudança de schema)

### O que foi implementado
- **Nova chave `house_timezone`** (`{ timezone }`, nome IANA, default `America/Recife`) e card **"Fuso horário"** na tela de Configurações: um `<select>` com 13 fusos brasileiros + alguns externos + `UTC`. A casa escolhe que horas são para ela.
- **Novo módulo puro `src/utils/timezone.ts`** — todo o trabalho no `Intl`, sem dependência nova: `zonedOffsetMs` (offset **calculado**, já considera DST), `zonedWallClockToInstant` (relógio de parede → instante, em **duas passagens** — é o par que resolve a borda de DST), `zonedWeekday`, `zonedDay` (para a Streak) e `isValidTimeZone` (o guard é o **próprio `Intl`**, não uma lista fechada — a lista da UI é só conveniência).
- **`America/Recife` deixou de estar hardcoded nos dois lugares** que dependem de "que horas são lá": o agendamento dos comunicados (`utils/comunicados.ts`) e o dia-contagem da Streak (`actions/stats.ts`, `registerLoginDay`). As assinaturas dos helpers passaram a receber o fuso: `nextComunicadoOccurrence(after, schedule, timeZone)` e `firstComunicadoOccurrence(now, schedule, timeZone)`; `recifeWeekday`/`recifeOffsetHours` foram removidos (não usados fora do módulo).
- **Fuso inválido nunca entra no banco:** o validator (`validateHouseTimezone`) usa `isValidTimeZone`, e o getter (`getHouseTimezoneSettings`) ainda cai no default se a linha gravada trouxer algo que o runtime não reconhece — um fuso quebrado não se propaga para o cálculo do agenda.
- **`revalidatePath` nas 3 rotas do dependente** ao salvar: o fuso muda o que está "devido" no overlay de comunicados e o dia da Streak, ambos calculados no render.
- **Não toca no prazo das tarefas**, que continua sendo o horário do dispositivo de cada um (`datetime-local` + `FormattedDateTime`) — a dica do card diz isso.

### 🐞 Bug pré-existente corrigido no caminho (importante)
Ao generalizar o fuso, a validação contra um oráculo independente revelou que o código antigo de comunicados tinha **o sinal do offset trocado nos dois pontos**. Como local = UTC − 3h, para ler a data local é preciso **subtrair** 3h — e o código **somava** (equivale a ler *(local + 6h)*):
- `recifeWeekday()` → devolvia o dia da semana errado;
- `slotOf()` → usava o mesmo `+3h` para achar a data-calendário local (o `+3h` do fim da conta está certo: parede → UTC é `UTC = local + 3h`).

**Alcance medido:** 240 agendas × 5.840 instantes (2 anos, de 3 em 3 horas) = **1.401.600 cenários**. Código antigo divergia do comportamento correto em **34%** deles; o novo diverge em **0**.
**Exemplo prático:** comunicado de domingo às `00:00`, avaliado às 18:00 de domingo — o slot já passou, então devia aparecer na hora; o antigo empurrava para o **domingo seguinte** (7 dias de atraso). Ou seja, **comunicados agendados para horário cedo podiam atrasar uma semana**. Quem usa comunicados vai ver o aviso aparecer **mais cedo** do que antes — é a correção, não uma regressão.

### Verificação
`npm run lint` ✓ (**0 warnings**) · `npm run typecheck` ✓ · `npm run build` ✓ (14 rotas).
Helpers puros executados com `node --experimental-strip-types` (loader temporário para o alias `@/`, fora do repo):
- **26 casos de fuso** — validação (nome válido, `Mars/Phobos`, vazio, `null`, número), offsets (Recife −3h nos dois hemisférios; Lisboa 0/+1 conforme o DST; `UTC` 0), parede → instante (Recife 08:00 = 11:00Z; Manaus = 12:00Z), **borda de DST de Lisboa** (antes e depois da virada), round-trip dos dois lados da virada, dia da semana local na virada de meia-noite e `zonedDay` na virada do dia por fuso.
- **Paridade do agendamento:** 1.401.600 cenários comparados contra um **oráculo escrito do zero** (com a regra de sinal explicitada) → **0 divergências**. E o **código antigo** contra o mesmo oráculo → 34% de divergência, o que dimensiona o bug corrigido.
- **Weekday x Intl:** varrida de 48h em 3 fusos brasileiros (antigo erra 12h de 48; novo 0) e de 40 dias em Lisboa/Santiago/New York, cobrindo a virada de DST (novo 0).
- Classes do card novo conferidas no CSS gerado (`bg-sky-100`, `text-sky-700`).

### Pontos de atenção
- **Mudança de comportamento visível:** por causa da correção do bug, comunicados com horário agendado cedo podem aparecer **imediatamente** (ou no mesmo dia) em vez de esperar o próximo dia da semana. Se um teste seu depended disso, o comportamento antigo estava errado.
- **Trocar o fuso reancora comunicados já agendados** (`repeat_time` é hora de parede): o próximo disparo passa a ser calculado no fuso novo. Não há migração de dados.
- **Fuso com DST só importa para casas fora do Brasil** — os fusos brasileiros não têm horário de verão hoje, então o ganho real do `Intl` aqui é a generalização, não o DST.
- A **Streak** é o outro lugar afetado: uma casa em Lisboa, por exemplo, fecha o dia antes do Recife e a contagem muda de dia em um horário diferente do nosso.
- Requer deploy para valer online.

---

## Duas chaves novas de configuração: silenciar notificações e limites de tarefas (implementado — sem mudança de schema)

### O que foi implementado
- **`notification_mute`** — a casa silencia **categorias** de notificação: `tasks` (os 7 `TASK_*` + os 3 `EXTENSION_*`), `rewards` (`REWARD_CREATED` + 3 `REDEMPTION_*` + 3 `SUGGESTION_*`) e `achievements` (`ACHIEVEMENT_UNLOCKED`). Default `false` em todas: uma casa que nunca abriu a tela não muda de comportamento.
- **`QUICK_MESSAGE` e `PENALTY` não têm toggle — e não existe caminho no código para silenciá-las.** Decisão explícita: a mensagem rápida é o canal direto do dependente para o tutor, e a penalidade é aviso de um débito real de pontos (que já exige motivo obrigatório). Silenciar os dois é o tipo de mute que vira briga em casa. Isso é garantido por construção, não por convenção: o mapeamento `notificationCategory()` devolve `null` para esses tipos, e o helper **falha em favor de notificar** (`isNotificationMuted` com categoria ausente ou settings legível falha ⇒ `false`).
- **Aplicação no gargalo único de escrita:** guarda no topo de `notifyUser`/`notifyHouse` (`src/utils/notifications.ts:91,127`) — categoria silenciada **não grava linha nem dispara push** (o retorno vem antes do insert e antes do bloco de push). É o único caminho de disparo de notificação do app, então silenciar vale para o sino, o toast via Realtime e o Web Push de uma vez. Silenciar **não apaga histórico**: só impede avisos futuros.
- **`task_rules`** — teto de pontos por tarefa (`maxPointsPerTask`) e limite de tarefas ativas por dependente (`maxActiveTasks`), ambos `0` = desligado (default, preserva o comportamento atual).
  - **Teto de pontos:** validado no servidor em `createTask` e `updateTask` (`checkPointsCap`) — rede de segurança contra erro de digitação, já que hoje `tasks.points` só barra valor negativo.
  - **Limite de tarefas ativas:** `checkActiveTaskLimit` conta `PENDING/IN_PROGRESS/NOT_DELIVERED` do dependente na casa. **`ON_HOLD` não conta** — a tarefa em espera é invisível para o dependente, então não lota a lista dele (mesmo conjunto do soft block de duplicidade). Roda em **cinco** lugares: o `createTask`, o `updateTask` quando o ADMIN reatribui (com `excludeTaskId`, para a própria tarefa não contar duas vezes) e as **três transições que devolvem a tarefa à lista do dependente** — `restoreTask` (`APPROVED` → `PENDING`), `setTaskOnHold(taskId, false)` (reativação de `ON_HOLD`) e `rejectCompletedTask` (`COMPLETED` → `PENDING`), via `checkReopenTaskLimit`. Erro de leitura do banco **libera** o limite (não bloqueia trabalho legítimo por falha transitória) e `0` nem gera consulta.
  - **Por que as três transições contam:** `APPROVED`, `ON_HOLD` e `COMPLETED` estão **fora** de `ACTIVE_TASK_STATUSES`, ou seja, nenhuma delas está na lista do dependente — voltar para `PENDING` **acrescenta** uma tarefa à lista dele. Sem a guarda, "Restaurar" burla o limite da casa (bug encontrado em teste: restaurar tarefa aprovada estourava `maxActiveTasks`). Tarefa **sem dependente** não é contada (não há lista para lotar). A mensagem de recusa é acionável nos três fluxos: conclua/aprove uma tarefa ou aumente o limite em Configurações.
- **UI:** o silenciamento **entrou no card "Notificações" que já existia** (3 `Toggle` no mesmo padrão do toggle "Decaimento ativo"), com a dica de que mensagem rápida e penalidade não são silenciáveis; o card **"Limites de tarefas"** é novo (`ListTodo`, ícone índigo), com 2 `Field` (`sm:grid-cols-2`). As duas chaves são gravadas **juntas** pelo mesmo botão "Salvar notificações" (mensagem de erro trazida da 2ª se a 1ª passar).
- **`validateNotificationMute` parte de `MUTEABLE_CATEGORIES`**, não das chaves recebidas: nenhum campo extra enviado pelo cliente entra no jsonb, e `QUICK_MESSAGE`/`PENALTY` não ganham toggle por acidente.
- **`revalidatePath`:** `task_rules` revalida `/tasks` (o limite aparece nos hints do form); `notification_mute` **não revalida nada** além da tela de configurações, porque só afeta notificações futuras.
- **Rótulos das categorias em um lugar só:** `notificationCategory()` em `src/types/notifications.ts` é usado tanto pelos toggles da UI quanto pela guarda no servidor — não há como um lado conhecer uma categoria e o outro não.

### Verificação
`npm run lint` ✓ (**0 warnings**) · `npm run typecheck` ✓ · `npm run build` ✓ (14 rotas, `ƒ Proxy` ativo). Regras puras conferidas executando os módulos reais com `node --experimental-strip-types` (loader temporário para resolver o alias `@/`, fora do repo): **17 casos de mute** — os 20 tipos mapeados (10 tarefas / 7 recompensas / 1 conquistas), nenhum tipo sem categoria, `QUICK_MESSAGE`/`PENALTY` imunes mesmo com tudo silenciado, mute por categoria correta, e fail-open com settings ausente/`undefined`/default. **8 casos do teto de pontos** — `0` nunca barra, 501 vs 500 recusa, 500 exato aceita. Classes do card novo conferidas no CSS gerado (`bg-indigo-100`, `text-indigo-700`).

### Pontos de atenção
- **Sem mudança de schema:** as duas chaves são valores jsonb em `house_settings`; linhas ausentes caem no default.
- **Silenciar é por categoria, não por tipo:** não dá para silenciar só `TASK_APPROVED` mantendo `TASK_REJECTED`. Escolha consciente — 20 toggles seriam ruído; se surgir a necessidade, o mapa `CATEGORY_BY_TYPE` vira a lista de chaves.
- **O limite de tarefas ativas é sempre por dependente, nunca global** e nunca por casa. Tarefa em espera e tarefa concluída/aprovada não contam.
- **O `updateTask` valida o limite apenas ao reatribuir** e o teto apenas quando `points` vem no patch — editar o título de uma tarefa que ficou acima do limite (porque o ADMIN baixou o teto depois) continua permitido. Escolha: não bloquear edição por regra já existente.
- **Desaprovar uma tarefa concluída também respeita o limite.** É o caso mais discutível dos três (o ADMIN às vezes quer devolver o trabalho para refazer), mas a regra é uniforme: as três transições *acrescentam* uma tarefa à lista do dependente, então as três passam pela mesma guarda. Se preferir que "Desaprovar" seja sempre permitido, é isolar `checkReopenTaskLimit` nessa action.
- **Etapa 2 (`house_timezone`) implementada** — ver a seção no topo do documento.

---

## Ajustes da visão geral do ADMIN e do modal de castigo (concluídos — sem mudança de schema)

### O que foi feito
- **Visão geral do ADMIN (`/dashboard/admin`) sem os cards "Tarefas" e "Recompensas".** A grade de ações ficou só com **Casas**, **Configurações** e **Comunicados** — as telas de tarefas/recompensas continuam accessible pela nav (ícones `ListTodo`/`Gift`), que é onde o ADMIN já trabalha. Com 3 cards, o `xl:grid-cols-5` da grade virou `lg:grid-cols-3` (5 colunas deixaria duas vazias em tela larga).
- **O modal de castigo do ADMIN passou a mostrar o castigo atual.** Antes ele abria com os campos vazios mesmo havendo castigo ativo — quem só queria editar o texto acabava **apagando a descrição** ao salvar. Agora, ao abrir o modal:
  - há um **bloco de leitura "Castigo atual"** com a descrição (ou "sem descrição — o dependente vê apenas o aviso"), a **duração** (`punishmentDurationLabel`) e o **vencimento** em `FormattedDateTime` (ou "sem prazo (sai só com 'Remover castigo')"), mais o instante em que foi aplicado;
  - os campos de **descrição e duração são controlados e inicializados com o castigo atual** — salvar faz *substituir* do que já existe, preservando o texto; "Remover castigo" volta os campos a vazio.
- **Um caminho único de leitura:** `getActivePunishmentProfileIds` (devolvia só os ids) foi **substituído** por **`getHouseActivePunishments(houseId)`** (`src/utils/active-punishment.ts`), que devolve os castigos ativos **com descrição/duração/vencimento** (`HouseActivePunishment = ActivePunishment & { profileId }` em `src/utils/punishments.ts`). A tela do ADMIN agora recebe `activePunishments: HouseActivePunishment[]` e monta um `Map` por `profileId` (`useMemo`) — o botão "Castigo" (âmbar quando ativo) e o modal leem do mesmo lugar, sem refazer a consulta. Nada de schema, action ou regra nova: a forma de exibir mudou, os dados são os mesmos.

### Verificação
`npm run lint` ✓ (**0 warnings**) · `npm run typecheck` ✓ · `npm run build` ✓ (14 rotas, `ƒ Proxy` ativo). A classe da grade foi conferida **no CSS gerado** (`.lg\:grid-cols-3` presente em `.next/static/chunks/*.css`), já que `lint`/`typecheck`/`build` não pegam classe não emitida.

### Pontos de atenção
- **Campos do castigo passaram a ser controlados** — são estado do React, mas **não são credenciais** (a regra do ADR-0003 é só para senha/PIN), então não há conflito com "credencial fora do estado React".
- **Remover limpa os campos:** depois de "Remover castigo" o modal fica com o formulário vazio, evitando sugerir que o texto apagado ainda vale.
- **A visão geral ficou com 3 cards**; se outra tela voltar a usar `xl:grid-cols-5` nesse contêiner, reavaliar a grade.
- Requer deploy para valer online.

---

## Castigo do dependente — aviso no cabeçalho, sem efeito em regra nenhuma (implementado — SQL aplicado no banco)

### O que foi implementado
- **Novo módulo `dependent_punishments` — só um indicador.** O ADMIN escreve um "castigo" para um dependente e ele passa a ver um **ícone de triângulo ao lado do sino** em todas as telas dele (`/dashboard/dependent`, `/tasks`, `/rewards`, `/achievements`); tocar abre um `Modal` com a descrição e a duração informadas pelo tutor. **Nada mais muda no app:** nenhuma escrita em `profiles.points`, `tasks`, `rewards` ou `dependent_achievements` — o castigo é aviso, não penalidade (a penalidade de verdade continua sendo o débito em `updateDependentPoints` com PIN da casa, e o `NOT_DELIVERED` segue intacto). Ver **ADR-0020**.
- **Descrição e duração OPCIONAIS, com semântica própria:** sem descrição o modal diz que o tutor não deixou texto; **sem duração o castigo não expira** e só sai quando o ADMIN remove ("Remover castigo" no mesmo modal). Com duração (1–365 dias) a action grava `expires_at = now + N dias` e a expiração é avaliada **na leitura** (sem cron no projeto, como o decaimento e os comunicados).
- **Um castigo ativo por dependente** (`UNIQUE (profile_id)`): aplicar de novo **substitui** o anterior (upsert), em vez de acumular avisos. O botão na linha do ADMIN vira "Substituir castigo" quando já existe.
- **Sem Realtime (decisão de produto, mesma premissa dos comunicados — ADR-0017):** o castigo chega ao dependente no **render server-side**; ele o vê ao atualizar a tela ou navegar. As actions chamam `revalidatePath` nas 4 rotas para a próxima renderização já trazer o dado novo. **Nada de notificação/push**: castigo não gera `notifications` nem entra na fila de alertas — é leitura, não evento.
- **Escopo derivado da sessão:** `applyPunishment(profileId, input)`/`removePunishment(profileId)` recebem **só o alvo** — a casa vem de `getActiveAdminHouse` (nunca de parâmetro público) e o alvo precisa ser `DEPENDENT` dela (um ADMIN nunca é punido). Qualquer **ADMIN da casa ativa** pode aplicar (inclusive co-ADMIN): punição é rotina, ao contrário de excluir conta/trocar PIN, que seguem restritos ao autor (ADR-0014).
- **Leitura com limpeza lazy:** `getActivePunishment(profileId, houseId)` (`src/utils/active-punishment.ts`, `React.cache`) apaga o castigo vencido na próxima leitura (best-effort) e **ainda assim** checa `expires_at` no código (`isPunishmentActive`), então falha no delete não mostra aviso vencido. `getHouseActivePunishments(houseId)` devolve os castigos ativos **com descrição/duração/vencimento** — um caminho único para a tela do ADMIN marcar a linha e mostrar o castigo atual no modal.
- **UI ADMIN** (`houses-manager.tsx`): botão **"Castigo"** (`TriangleAlert`, âmbar quando há castigo ativo) na linha de cada `DEPENDENT`, com `Modal` que explica que é só um aviso, campo de descrição (textarea, `maxLength` 500) e de duração (number, 1–365, vazio = sem prazo), feedback inline + toast + `router.refresh()`. O modal **mostra o castigo ATUAL** em um bloco de leitura (descrição ou "sem descrição", duração e vencimento em `FormattedDateTime`) e os campos de descrição/duração são **controlados, inicializados do castigo atual** — assim salvar substitui/edita o que já existia em vez de apagar o texto por engano; "Remover castigo" limpa os campos.
- **UI DEPENDENT:** `PunishmentIndicator` (`src/components/punishments/punishment-indicator.tsx`) é o botão de triângulo âmbar + modal de leitura ("Aviso de punição", com botão "Entendi" e o vencimento em `FormattedDateTime`). A `DashboardNav` ganhou a prop `punishment?: ActivePunishment | null` e renderiza o indicador **ao lado do sino**, logo depois de `NotificationsBell` — só o DEPENDENT recebe a prop.
- **Limpeza:** `expelMember`/`deleteDependentAccount` removem o castigo do alvo e `deleteHouse` remove os castigos da casa (FK também tem cascade, mas o fluxo é explícito, como o resto).

### SQL aplicado no banco
**Já aplicado no Supabase e verificado por probe** (a tabela responde sem erro e o fluxo foi testado ponta a ponta). Arquivo completo em `docs/sql/dependent_punishments.sql` — registro do que foi rodado:
```sql
-- docs/sql/dependent_punishments.sql (rodar no SQL Editor do Supabase):
create table if not exists public.dependent_punishments (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  description text check (description is null or char_length(btrim(description)) between 1 and 500),
  duration_days int check (duration_days is null or duration_days between 1 and 365),
  expires_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id)
);
create index if not exists dependent_punishments_house_idx on public.dependent_punishments (house_id);
create index if not exists dependent_punishments_expires_idx on public.dependent_punishments (expires_at);
alter table public.dependent_punishments enable row level security;
-- SEM policies (service-role) e FORA da publication supabase_realtime (módulo sem tempo real).
```

### Verificação
`npm run lint` ✓ (**0 warnings**) · `npm run typecheck` ✓ · `npm run build` ✓ (14 rotas, `ƒ Proxy` ativo). As regras puras de `src/utils/punishments.ts` foram conferidas executando o módulo com `node --experimental-strip-types` (script temporário fora do repo, sem dependência nova): validação (descrição > 500, duração 0/366/fracionária reprovam; campos vazios são válidos), expiração (sem duração = sempre ativo, `now + 7 dias`, vencido e ISO inválido inativos) e rótulos.

### Pontos de atenção
- **Nada pendente:** SQL aplicado no banco e feature testada ponta a ponta (botão "Castigo" → ícone no dependente → expiração/remoção).
- **Castigo sem duração não expira sozinho:** é intencional (dá para manter o aviso durante toda a fase), mas significa que a limpeza depende do ADMIN removendo.
- **Sem tempo real:** se o ADMIN aplicar o castigo com o dependente na tela, o triângulo só aparece depois de um refresh/navegação dele. É a mesma limitação aceita dos comunicados.
- **Unidade da duração escolhida como dias (1–365)** — não havia definição previa; se mudar para horas/data fixa, o ajuste é em `punishmentExpiryFromNow` + `src/utils/punishments.ts` + a coluna.
- **Não confundir com as outras penalidades:** a `PENALTY` (débito de pontos com PIN, via `updateDependentPoints`) e a tarefa `NOT_DELIVERED` continuam sendo efeitos reais e independentes deste indicador.

---

## Zerar a contagem de uma conquista `MANUAL` (implementado — sem mudança de schema)

### O que foi implementado
- **Nova Server Action `resetAchievementProgress(achievementId, profileId)`** (`src/actions/achievements.ts`): atalho para o caso em que o `−1` exigiria muitas cliques (objetivo alto) ou para recomeçar a contagem do zero. **Zera o ciclo**: `current_progress = 0` e `unlocked_at = null` — ou seja, um desbloqueio ainda não resgatado é **revogado** (o dependente perde o botão de resgate). O `level` (histórico de resgates) **nunca** muda.
- **Mesmas guardas do `adjustAchievementProgress`:** só ADMIN da casa ativa, só conquista `MANUAL` da casa e alvo `DEPENDENT` membro; **exige progresso existente** (sem linha ou já em 0 → erro, não uma linha zerada). A gravação passa pelo `syncAchievementProgress` com `compute` fixo em `{ progress: 0, unlockedAt: null }`, reaproveitando o update atômico com guard + 1 retry (e escopo em `onlyAchievementId`, então não toca nas outras `MANUAL` da casa). **Sem notificação:** revogar não é desbloquear.
- **Releitura de confirmação:** como o `syncAchievementProgress` é best-effort (nunca lança), a action relê a linha e só devolve `ok: true` se `current_progress` realmente estiver em `0` — o ADMIN nunca recebe "contagem zerada" com o dado velho. Devolve a linha gravada (`data.progress`) para a UI reconciliar, como no ajuste.
- **UI (`achievements-admin.tsx`):** botão **`RotateCcw`** ("zerar contagem") no grupo `MANUAL` de cada dependente, só quando há progresso, com `Modal` de confirmação que avisa o quanto volta (`0/N`) e o efeito no desbloqueio. Resposta imediata: otimismo (barra a `0` na hora) + reconciliação pelo valor do servidor, rollback por snapshot em erro — o mesmo padrão do `+1`/`−1`. A reconciliação foi extraída para `mergeProgressSnapshot`, agora usada pelos dois handlers.

### Verificação
`npm run lint` ✓ (**0 warnings**) · `npm run typecheck` ✓ · `npm run build` ✓ (14 rotas, `ƒ Proxy` ativo).

### Pontos de atenção
- **Sem mudança de schema:** usa as colunas que já existem (`current_progress`/`unlocked_at`/`level`) e o mesmo helper de gravação do ajuste — não há caminho de escrita paralelo.
- **Assinatura diferente do `adjustAchievementProgress`** (`amount` com sinal): o reset é uma operação absoluta (zerar), não um delta — uma action separada deixa a guarda de "valor não nulo" explícita em vez de um `amount = 0` mágico que passaria pela validação de "≠ 0".
- Revogar desbloqueio é coerente com o `−1` (ADR-0019): um `unlocked_at` com progresso `0` manteria o botão de resgate ativo com a barra zerada.

---

## Progresso de conquista trava no objetivo enquanto o resgate está pendente (implementado — sem mudança de schema)

### O que foi implementado
- **Bug:** `current_progress` **não tinha teto** e continuava somando depois do desbloqueio — o dependente via `12/5` no card com a barra lotada há semanas. Pior: como o excedente ficava guardado, o rollover do resgate (`progress − target_count`) **represervava** a sobra e o próximo evento re-derivava do contador absoluto, então um `12/5` rendia um segundo ciclo quase de graça. Ou seja: pontuação contava **sem** resgate.
- **Regra nova (decidida com o usuário):** o progresso de um ciclo vive entre `0` e `target_count`. Desbloqueada e não resgatada, a conquista fica **congelada em `N/N`** e o **excedente é descartado** — o ciclo seguinte só volta a contar depois do resgate (antes preservava).
- **Dois helpers puros** em `src/utils/achievements.ts` concentram a regra: **`capAchievementProgress(progress, target)`** (teto/piso, também usado na exibição) e **`applyAchievementProgress(current, target, amount)`** (**soma trava no objetivo**; **subtração tem piso 0 e continua valendo mesmo desbloqueada** — é o que mantém a revisão do tutor (`−1` em `MANUAL`) revogando o desbloqueio). Os três caminhos de escrita usam o mesmo helper, para não voltarem a divergir.
- **`evaluateAchievements` (`src/actions/stats.ts`):** métrica **repetível passou a ser incremental no valor gravado** (igual a `EARNED_POINTS`/`MANUAL`), com teto — era a única forma de descartar o excedente, já que `contador − (nível−1) × objetivo` fazia a sobra reaparecer sozinha. Só a **primeira** ocorrência da conquista usa o contador (histórico anterior conta, como nas únicas). **Única segue derivada** do contador (`min(contador, objetivo)` com piso histórico `max(registrado, contador)`). O `amount` da ocorrência passou a ser parametro de `evaluateAchievements(houseId, profileId, metricType, amount = 1, actorId?)` (repassado por `incrementDependentStat`; `registerLoginDay` manda `1`).
- **`EARNED_POINTS`** (valor corrente creditado) e o **`adjustAchievementProgress`** do tutor passaram a usar `applyAchievementProgress` — inclusive no update otimista do `achievements-admin.tsx`.
- **`claimAchievementReward`** grava **`current_progress = 0`** no ciclo novo (antes `max(0, progress − target_count)`); o update otimista do card do dependente foi junto. `target_count` saiu do `select` da action (não é mais usado ali).
- **UI:** o card do dependente mostra `N / N` com **cadeado + "travado até resgatar"** enquanto há resgate pendente (`Lock` do lucide), e `N/N`/barra usam o teto (linhas legadas não exibem mais `12/5` mesmo antes do resize no banco). No ADMIN, o `+1` de `MANUAL` **desliga** em `N/N` e o contador exibido é limitado.

### Verificação
`npm run lint` ✓ (**0 warnings**) · `npm run typecheck` ✓ · `npm run build` ✓. As regras puras foram conferidas executando `capAchievementProgress`/`applyAchievementProgress` com `node --experimental-strip-types` (script temporário fora do repo, sem dependência nova): 12 ocorrências → `5/5*` travado; após resgate → nível 2 em `0/5` e só desbloqueia de novo na **5ª** ocorrência nova; `MANUAL` `4+1 = 5/5` (desbloqueia) e `−1` → `4/5` (revoga); `+1` em linha legada `12` → `5`.

### Pontos de atenção
- **Sem mudança de schema:** `current_progress` continua `int` sem cap no banco. As linhas **já gravadas** acima do objetivo foram **limpas com `docs/sql/achievement_progress_cap.sql`** (UPDATE que limita cada linha à `target_count` da conquista — SQL aplicado pelo usuário); o app também se autocorrige na próxima ocorrência da métrica, porque o helper limita o valor na escrita.
- **Perde-se a recuperação automática** do modelo derivado: se a gravação do progresso falhar (`syncAchievementProgress` é best-effort), aquele evento não volta na próxima ocorrência — mesmo comportamento que `EARNED_POINTS`/`MANUAL` já tinham. A escrita segue com guard `.eq('current_progress', valor lido)` + 1 retry relendo, então concorrência não perde incremento.
- O contador de `dependent_stats` **não zera** (continua alimentando as únicas e sendo a métrica bruta da casa); só o progresso do ciclo é travado.
- **Única** mantida derivada do contador de propósito: meta de vida única deve contar todo o histórico.
- Decisões registradas em **ADR-0019**.

---

## Layout widescreen — shells em `max-w-7xl` e grades por breakpoint (concluída — sem mudança de schema)

### O que foi implementado
- **Shells mais largos (10 pontos):** todos os containers de página que usavam `max-w-5xl` passaram para **`max-w-7xl`** — layouts admin e dependente, `/tasks`, `/rewards`, `/achievements`, `/dashboard/admin/settings`, `/dashboard/admin/comunicados` (incluindo os retornos de "Nenhuma casa ativa") e o header do `DashboardNav`. As telas de auth (`max-w-md`) **não** foram tocadas.
- **A largura extra virou colunas, não faixa vazia** (por container): visão geral do ADMIN `sm:grid-cols-2 lg:grid-cols-3` (hoje só 3 cards — Casas/Configurações/Comunicados — depois de remover "Tarefas"/"Recompensas", que seguem na nav); dashboard do dependente com **saldo + tutores lado a lado** em `lg:grid-cols-2` (as ações continuam em `sm:grid-cols-2`); catálogo de recompensas do dependente `xl:grid-cols-3`; catálogo de conquistas do dependente `xl:grid-cols-3`; conquistas do ADMIN e comunicados `xl:grid-cols-2`; configurações `lg:grid-cols-2` com o banner `lg:col-span-2`; recompensas do ADMIN em coluna fixa + lista (`xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]`).
- **Listas longas em 2 colunas:** as seções de tarefas (`tasks-admin.tsx` — pendentes/concluídas/aprovadas/em espera — e `tasks-dependent.tsx`) e de recompensas (`rewards-admin.tsx`, `rewards-dependent.tsx`) viraram `grid gap-3 xl:grid-cols-2`; o **heading interno** de cada uma ganhou `xl:col-span-2` (sem isso o título fica preso na 1ª coluna).
- **Casas ficaram em 2 colunas:** `houses-manager.tsx` mantém `md:grid-cols-2` com o card de membros `md:col-span-2` — chegou a ser `xl:grid-cols-3`, mas em 3 colunas os formulários de casa/dependente ficam estreitos demais, então a casa continua com largura de comfortably 2 colunas.

### Verificação
`npm run lint` ✓ (**0 warnings**) · `npm run typecheck` ✓ · `npm run build` ✓ (14 rotas, `ƒ Proxy` ativo). Além disso, as classes novas foram conferidas **no CSS gerado** (`.next/static/chunks/*.css`) depois do build — ver abaixo.

### Pontos de atenção
- **Variantes `2xl:` NÃO geram CSS neste projeto (Tailwind `4.3.3`).** Descoberto ao conferir o bundle: as listas foram inicialmente escritas com `2xl:grid-cols-2`/`2xl:col-span-2` e o build passava (lint/typecheck/build não reclamam), mas **nenhum `.2xl\:` saía no CSS** — ou seja, o layout ficaria 1 coluna em toda tela, silenciosamente. Confirmado no pipeline real (`@tailwindcss/postcss` sobre `src/app/globals.css`) e também com `@source inline("xl:grid-cols-5 2xl:grid-cols-2 min-[1536px]:grid-cols-4")`, que descarta o scanner: **`xl:` e `min-[1536px]:` geram, `2xl:` não**. Todas as classes foram trocadas para `xl:`. **Não reintroduzir `2xl:`** — quem precisar do gatilho de 1536px usa `min-[1536px]:`.
- **`lint`/`typecheck`/`build` não pegam classe não gerada.** Para conferir de verdade, buscar o nome escapado no CSS do bundle depois do build (`.xl\:grid-cols-2`, `.xl\:col-span-2`, `.max-w-7xl`, …). Registrado também no `AGENTS.md` §2.
- **Validação visual não foi feita** (precisa de sessão/login) — o que passou foi build + inspeção do CSS gerado.

---

## Tarefa em espera (`ON_HOLD`) + penalidade de "não entregue" agora definitiva (implementado — SQL do enum aplicado)

### O que foi implementado
- **A penalidade virou definitiva (decisão do usuário):** aprovar um adiamento ou alterar o prazo de uma tarefa `NOT_DELIVERED` **reabre** a tarefa mas **não devolve mais** os pontos debitados. Saiu o `adjustPoints` positivo (e o rollback de reembolso) dos **dois** fluxos — `resolveTaskExtension` (aprovar) e `updateTask` (alteração de `due_date`). A reabertura segue fazendo `tasks.points = 0` + status equivalente ao novo prazo, então a tarefa volta a valer **0 pontos** e uma aprovação futura não credita nada. O texto do card `NOT_DELIVERED`, as notificações e as mensagens de retorno foram reescritos ("A penalidade é definitiva…"). O reembolso só em um dos fluxos seria brecha pela edição direta do prazo — por isso os dois.
- **Novo status `ON_HOLD` ("em espera")** — uma nova transição "neutra" do ADMIN: pausar uma tarefa sem concluir, aprovar ou apagar.
  - **Pode entrar:** `PENDING`, `IN_PROGRESS` e `NOT_DELIVERED` (tarefa concluída/aprovada é histórico — não faz sentido pausar). Guard `.in('status', […])` na própria transition.
  - **Some do dependente por completo:** filtro `.neq('status','ON_HOLD')` no carregamento de `/tasks` (branch dependente) + as guards que já exigem `PENDING/IN_PROGRESS` em `completeTask`/`requestTaskExtension`; `updateTask` recusa com "Reative a tarefa antes de editá-la"; `markTaskNotDelivered` não aceita. O pedido de adiamento pendente é **descartado** na pausa (o dependente pede de novo quando a tarefa volta) e a tarefa **não** fica congelada para edição: `updateTask` edita normalmente (só a visibilidade some).
  - **`NOT_DELIVERED` entra valendo 0:** pausar **não** é caminho para escapar da penalidade — o `points = 0` é gravado já na pausa.
  - **Reativar:** `setTaskOnHold(taskId, false)` volta **sempre** para `PENDING` com **prazo novo** (agora + `task_sla.defaultDueDays` da casa) e **relógio do decaimento reiniciado** — mesmo ciclo do `restoreTask` — preservando `tasks.points` e **sem tocar no saldo** em nenhum dos dois sentidos.
  - **Uma action só** (`setTaskOnHold(taskId, onHold)`) com guard no status (`.in(...)` ao pausar, `.eq('status','ON_HOLD')` ao reativar) — mesma defesa contra clique concorrente das demais actions; devolve a linha gravada (`data.task`) para a UI aplicar otimismo + reconciliação.
  - **UI ADMIN** (`tasks-admin.tsx`): botão **"Colocar em espera"** (`PauseCircle`) no card pendente (também no `NOT_DELIVERED`) + nova seção **"Em espera"** com o botão **"Voltar para pendente"** (`PlayCircle`) sempre visível fora do toggle (como o "Restaurar" das aprovadas), accent/cinza em `task-styles.ts` e aviso no card expandido ("invisível para o dependente"; "valendo 0 pontos" quando `points === 0`).
  - **Notificação ao dependente nos dois sentidos:** novo tipo **`TASK_ON_HOLD`** (sino com `PauseCircle` cinza + toast `info`) na pausa e reuso de `TASK_RESTORED` na reativação ("voltou para a sua lista com novo prazo").
  - **Limpeza de membro:** `expelMember`/`deleteDependentAccount` passam a apagar também as tarefas `ON_HOLD` (é dado ativo da casa, não histórico) — evita órfãos que reapareceriam se o mesmo `username` fosse recriado.
  - **Não toca** `dependent_stats`/conquistas: pausar não é aprovar nem rejeitar.

### SQL (docs/sql/task_on_hold.sql — **aplicado pelo usuário**)
```sql
-- Status "em espera" (ON_HOLD) — tarefa pausada pelo ADMIN.
-- Rodar sozinho no SQL Editor (o valor novo não pode ser usado na mesma transação).
alter type public.task_status add value if not exists 'ON_HOLD';
-- select unnest(enum_range(null::public.task_status)) as status;  -- confirmação
```

### Verificação
`npm run lint` ✓ (**0 warnings**) · `npm run typecheck` ✓ · `npm run build` ✓ (14 rotas, `ƒ Proxy` ativo).

### Pontos de atenção
- **Enum no banco (aplicado pelo usuário):** o `alter type … add value if not exists 'ON_HOLD'` está no banco (confirmado por probe: `status=eq.ON_HOLD` respondia `22P02 invalid input value for enum task_status` **antes** da aplicação). `setTaskOnHold` passou a tratar `error` e "guard devolveu 0 linhas" como caminhos separados — o `console.error` registra o erro real e o `22P02` devolve *"O banco ainda não tem o status 'em espera'. Rode docs/sql/task_on_hold.sql no Supabase"* em vez de culpar outra pessoa. `src/types/database.ts` espelha o valor (espelho manual, sem `supabase gen types`).
- **A pausa é invisibilidade, não bloqueio:** o dependente simplesmente não vê a tarefa. Se ninguém reativar, ela fica parada (sem prazo correndo de verdade — o prazo é recalculado na reativação).
- **`ON_HOLD` não é "adiamento automático":** o prazo só muda quando o tutor reativa. Não há SLA/contagem regressiva para uma tarefa em espera.
- **Edição liberada durante a pausa (emenda de 2026):** `updateTask` passou a aceitar `ON_HOLD` (só `COMPLETED`/`APPROVED` continuam imutáveis) e o card em espera ganhou os mesmos campos editáveis do pendente (título/descrição/responsável/pontos com debounce). O **prazo** ficou de fora de propósito: a reativação sempre calcula um prazo novo (agora + `task_sla.defaultDueDays`), então um campo de prazo ali seria descartado em silêncio — aparece como texto "Prazo atual (temporário)". Editar uma tarefa pausada **não** mexe no status, no saldo nem no `dependent_stats`; a decisão original ("edição congelada") está superada por esta.
- A penalidade definitiva vale **também** para `updateTask`: quem tentasse burlar o "não entregue" editando o prazo direto não recupera nada.
- **Depende de schema + requer deploy** para valer online.

---

## Fila de alertas única do dependente: comunicados + penalização, com comprovação de leitura (implementado — sem mudança de schema)

### O que foi implementado
- **Uma fila só, FIFO, sem prioridade:** tudo que exige confirmação do dependente entra na **mesma** fila — os **comunicados publicados** e o **alerta de penalização** (`PENALTY`). A ordem é a natural por data de criação (`created_at` do comunicado / da notificação): **a penalização não tem prioridade** e não pula a fila. O modal próprio `penalty-dialog.tsx` foi **removido** (`src/components/notifications/penalty-dialog.tsx`) junto com o overlay antigo de comunicados (`src/components/comunicados/comunicado-overlay.tsx`).
- **Novo componente `AlertQueueOverlay` (`src/components/alerts/alert-queue-overlay.tsx`):** portal `z-[120]` (acima do `Modal` z-[100]), itens **um-a-um**, foco preso no campo de confirmação (comunicado) ou no botão (penalização), **Esc bloqueado** (capture em `keydown`), scroll do documento travado e Tab ciclando só dentro da janela. Props: `userId` + `initialQueue` (`getDueComunicados()` no render) + `initialNotifications` (notificações não lidas no render). Quando há mais de um item, mostra "Item 1 de N".
- **Ganho de cobertura:** como a penalização passou a viver no mesmo overlay, ela **também aparece em `/tasks` e `/rewards`** (antes a `PenaltyDialog` só era montada no layout `/dashboard/dependent`). Montagem nos mesmos 4 pontos de antes: layout dependente e as branches dependentes de `/tasks`, `/rewards`, `/achievements`.
- **Comprovação de leitura do comunicado (trava de leitura):** confirmar exige **digitar ao menos 3 palavras do próprio aviso** — do título **ou** da descrição, em qualquer ordem, sem diferenciar maiúsculas/minúsculas ou acentos; palavras repetidas não contam e termos de 1 caractere são ignorados. O predicado puro **`matchedAlertWords`** (novo `src/utils/alert-queue.ts`) habilita o botão na UI (com contador "N de 3") e **o servidor revalida** em `confirmComunicadoDelivery(id, typedPhrase)` — que relê título/descrição do comunicado e **recusa** se não bater (fail closed). A **penalização não tem esse passo**: basta "Entendi" (`markNotificationRead`).
- **Fila de comunicados sem tempo real (decisão de produto mantida), fila de penalidades com Realtime:** os comunicados vêm do servidor no render de cada tela e saem da fila **na hora** ao confirmar (estado local, sem esperar round-trip — o `refreshDue()` do overlay antigo deixou de existir). As penalizações também nascem no render, mas **acompanham o Realtime de `notifications`** (filter `recipient_id=eq.<userId>`): penalidade nova entra na fila e uma já marcada como lida no sino sai.
- **Descrição do comunicado com mínimo de 30 caracteres:** `COMUNICADO_MIN_DESCRIPTION = 30` / `COMUNICADO_MAX_DESCRIPTION = 500` em `src/utils/comunicados.ts` (usadas pela action e pelo form), validação fail-closed com `.trim()` no `validateComunicadoFields`; no `comunicados-admin.tsx` o campo ganhou `minLength`, rótulo "mínimo 30 caracteres" e contador vivo. Motivo: aviso de 1–2 palavras não dá contexto para a comprovação de leitura.
- **Hidratacao do overlay:** o portal só é montado após a hidratação (`useSyncExternalStore` com snapshot `false` no servidor / `true` no cliente, mesmo padrão do `FormattedDateTime`) — montar a árvore com `typeof document` divergia do servidor quando a fila tinha itens.

### Verificação
`npm run lint` ✓ (**0 warnings**) · `npm run typecheck` ✓ · `npm run build` ✓ (14 rotas, `ƒ Proxy` ativo).

### Pontos de atenção
- **Limite conhecido/aceito:** o comunicado confirmado fica marcado como confirmado **na montagem atual** do overlay — se a mesma ocorrência voltar a ser devida sem recarregar a página, ela não reaparece até o overlay remontar. Na prática a próxima ocorrência é sempre no dia/horário agendado seguinte.
- Se o servidor **recusar** a confirmação (item obsoleto), o item **sai da fila** mesmo assim: insistir no mesmo item bloquearia a fila inteira.
- Sem mudança de schema: nada de coluna, tabela ou migration nova (as 2 tabelas de `docs/sql/comunicados.sql` **já estão aplicadas** no banco).
- Decisões registradas em **ADR-0017** (emendas de 2026).

---

## X de limpar em todos os campos de texto (implementado — sem mudança de schema)

### O que foi implementado
- **Novo componente `ClearableInput` (`src/components/ui/clearable-input.tsx`):** wrapper do `Input` (primitiva, estilo intacto) com um **botão `X` no fim** — apagar o que foi digitado vira um clique, sem selecionar tudo e apagar. O botão só **aparece com conteúdo**, é `type="button"` (não submete o form), tem `aria-label="Limpar campo"` e **devolve o foco ao campo** para continuar digitando. O input ganha `pr-11` só quando há texto, para o valor não passar por baixo do X.
- **Trabalha nos dois modos de input, num lugar só:** em input **controlado** (`value` + `onChange`) o X dispara o `onChange` com valor vazio (todo handler do app lê só `event.target.value`); em input **não controlado** (os formulários que leem `FormData`) limpa o DOM e dispara um evento `input` nativo para o React e o form perceberem a mudança. O prop `onClear` sobrescreve os dois caminhos. O `ref` externo continua chegando no `<input>` interno (usado pelo foco automático do form de conquistas).
- **Aplicado em 20 campos** (busca, títulos/descrições de formulário e identificação):
  - **Buscas:** `rewards-admin.tsx` e `rewards-dependent.tsx` (`type="search"`) — o **X nativo do navegador foi escondido** em `src/app/globals.css` (`input[type="search"]::-webkit-search-cancel-button`). Motivo: o botão nativo (`::-webkit-search-cancel-button`) só existe em **Blink/WebKit** e varia entre plataformas (Firefox e alguns Android WebView não o exibem), então o `ClearableInput` é que garante o mesmo campo em todo navegador — além de evitar o X duplicado no Chrome;
  - **Títulos/descrições:** tarefa (nova), recompensa (criar/editar), sugestão de recompensa, conquista (título + descrição), comunicado (título);
  - **Identificação:** nome da casa (criar/editar), PIN da casa, nome/usuário do dependente (criar/editar), descrição do ajuste de pontos, nome completo (perfil), usuário e nome no login/cadastro.
- **Onde deliberadamente NÃO foi aplicado:** numéricos (custo/pontos/objetivo/nível/multiplicador), data/hora (a tarefa já tem botões "Amanhã/+2h/Limpar"), **senha** e PIN de pontos (papel do botão é o input; o padrão para credencial é mostrar/ocultar) e **`textarea`** (descrições, motivo do adiamento, mensagem rápida) — lá o `type`/o botão já fazem esse papel, e o `textarea` do projeto não tem primitiva, então um wrapper exigiria|stylear cada caso à mão.
- **Ajuste de layout junto:** a dica do autocomplete ("as sugestões combinam as palavras…") estava empurrando o dropdown "Você quis dizer..." para baixo dela — o `<ul>` das sugestões passou a ser posicionado por um wrapper `relative` **só do input**, então abre logo abaixo dele, sobre a dica.

### Verificação
`npm run lint` ✓ (**0 warnings**) · `npm run typecheck` ✓ · `npm run build` ✓ (14 rotas, `ƒ Proxy` ativo).

### Pontos de atenção
- O botão é `position: absolute` dentro de um wrapper `relative`: em célula de **grid** ou em `flex-col` ele ocupa a largura toda sem quebrar o alinhamento (o `Input` segue `w-full`).
- Em input controlado, o X dispara um `onChange` sintético com apenas `target.value` — suficiente para todos os handlers do projeto, mas um handler que use `event.currentTarget`/`event.name` precisaria do `onClear` explícito.
- Requer deploy para valer online.

---

## Autocomplete de tarefas agora combina **palavras/tags** (ordem indiferente) (implementado — sem mudança de schema)

### O que foi implementado
- **Busca por combinação de palavras** no "Você quis dizer..." do form de nova tarefa (ADMIN): antes era `includes` do título inteiro (ex.: digitar "varrer sala" só encontrava quem tivesse a frase exata nessa ordem). Agora o que importa é a **combinação das palavras** (tags) do título, **em qualquer ordem**, com a melhor combinação primeiro.
- **Regras (`src/utils/task-normalize.ts`, módulo puro reusado pelo autocomplete):**
  - cada palavra digitada precisa de **1 caractere ou mais** (`MIN_MATCH_WORD_LENGTH = 1`) — vale "q" → "quarto". Como atalhos curtos ("o", "e", "de") **passam a contar** na combinação, quem coloca a melhor sugestão no topo é a ordenação por qualidade (exata > prefixo > trecho) e depois pelo tamanho do título; busca **vazia** é a única que não sugere;
  - o termo casa com uma palavra do título por **igualdade** (3), **início/prefixo** (2 — "quar" → "quartos") ou **trecho** (1 — "ozi"/"zin"/"nha" → "cozinha");
  - **todas** as palavras precisam casar (`rankTaskTitle` devolve `null` no primeiro termo que falta) — por isso "varrer sala" **não** puxa "Varrer a cozinha";
  - a ordem das sugestões é: mais palavra exata > título mais curto (combinação mais específica) > casa mais na frente; até 3 itens, como antes.
- **Exemplos validados:** "quarto limpar" → *Limpar todo o Quarto* · "varrer sala" → *Varrer o quintal e sala* (e não *Varrer a cozinha*) · "varrer quar" → *Varrer todos os quartos* (e não *Arrumar todo o seu quarto*) · "zin"/"nha"/"ozi" → *Varrer a cozinha* · com 1 caractere: "q" → *Varrer todos os quartos*, "s" → *Varrer o quintal e sala*.
- **Reaproveitamento e escopo:** `normalizeTaskTitle` continua sendo a normalização única (mesma nos dois lados); o novo `searchTasksByWords<T>(query, items, getTitle, limit)` é **genérico** (não acopla ao tipo `Task`) e roda em **`useMemo`** no `tasks-admin.tsx`. **Sem consulta ao banco:** o catálogo da casa já está inteiro no estado do form (carregado no servidor e mantido pelo Realtime) — uma query por tecla só adicionaria latência. O **guard de duplicidade** (soft block no client + título normalizado no `createTask`) segue exigindo **igualdade**: são duas regras diferentes.
- **UI:** uma linha de dica sob o input do título explica a regra ao tutor ("combina as palavras digitadas, em qualquer ordem — até um caractere serve: 'q' encontra 'quarto'"). As sugestões continuam com chip de status + nome do pupilo e o clique segue preenchendo o form (ou entrando em "Reativar" quando a tarefa é `APPROVED`).

### Verificação
`npm run lint` ✓ (**0 warnings**) · `npm run typecheck` ✓ · `npm run build` ✓ (14 rotas, `ƒ Proxy` ativo). *Os exemplos acima foram conferidos executando o módulo puro com `node --experimental-strip-types` (script temporário fora do repo, sem dependência nova e sem teste configurado no projeto).*

### Pontos de atenção
- **Mínimo de 1 caractere (ajuste pedido pelo usuário):** vale um caractere só ("q" → "quarto"), mas atalhos como "o"/"e" também entram na combinação — por isso a ordenação por qualidade é a garantia de que a melhor sugestão fica no topo. Busca só com letras muito comuns ("a e o") passa a listar quase tudo do catálogo; é o comportamento esperado do mínimo 1, e a busca **vazia** é a única sem sugestão.
- **Tags = palavras do título:** não há coluna de tags no banco (nem SQL novo) — "tag" aqui é a palavra normalizada do título. Se um dia o tutor quiser tags curtas separadas do nome ("quarto" em "Limpar o quarto"), aí sim é uma coluna nova + migration.
- Ponteiros curtos ambíguos podem apontar para várias tarefas ("sala" casa com "salão"/"salada"; "q" casa com "quarto"/"quadro"); a ordem resolve pelo contexto das outras palavras e pelo tamanho do título.
- Requer deploy para valer online.

---

## Lint zerado — imports mortos removidos e a regra `no-img-element` desligada (concluída)

### O que foi feito
- **`npm run lint` termina em 0 warnings.** Antes: 20 warnings (18 `no-img-element` + 2 `no-unused-vars`).
- **Imports mortos removidos (código real, não configuração):** o `import { House } from 'lucide-react'` de `src/app/(auth)/login/page.tsx` e de `src/app/(auth)/register/page.tsx` — o ícone só aparecia citado dentro de um comentário JSX. Os comentários que mencionam `<House/>` seguem lá (comentário não depende do import).
- **Regra `@next/next/no-img-element` desligada no `eslint.config.mjs`** (bloco `rules` depois de `...nextTs` — no flat config o último bloco vence a `'warn'` do `@next/eslint-plugin-next`): as 18 ocorrências são **deliberadas** — 15 URLs públicas do Storage (avatars, casas, recompensas, tarefas, conquistas, mensagens) e 3 do ícone do app em `/public/icons`. A decisão de usar `<img>` continua a do **ADR-0005**; o que mudou foi a forma de registrá-la (config em vez de ruído no lint).
- **Estado limpo travado:** o script virou `"lint": "eslint --max-warnings 0"`, então qualquer warning novo (inclusive regra que venha a ser adicionada/atualizada no `eslint-config-next` num upgrade) **quebra** o comando em vez de passar despercebido.

### Verificação
`npm run lint` ✓ (**0 problems**, `exit=0`) · `npm run typecheck` ✓ · `npm run build` ✓ (14 rotas, `ƒ Proxy` ativo).

### Pontos de atenção
- **Sem código de app adicionado** — a limpeza é exclusão de 2 imports + 5 linhas de config. Nenhuma das alternativas descartadas entrou: componente `StorageImage` (1 arquivo novo + 15 trocas), `eslint-disable` por arquivo (13 comentários) ou migração para `next/image` (`images.remotePatterns` amarrado ao host do Supabase + `width`/`height` em cada uso + otimizador na frente de conteúdo do usuário — contraria o ADR-0005).
- Se surgir um asset **LCP-crítico** (ex.: um banner grande na home), aí sim: `next/image` + `images.remotePatterns` no `next.config.ts` **e** reativar a regra no config.
- **Atenção em upgrade de dependência:** o próximo `npm run lint` vermelho pode ser uma regra nova do `eslint-config-next` em vez de código novo — aí se avalia caso a caso (ou se desliga a regra nova com comentário, como aqui).
- Requer deploy apenas para o efeito das **imagens de login/cadastro** (remoção do import não muda render; a logo continua a mesma).

---

## Formulário de conquista abre com foco automático (concluída — sem mudança de schema)

### O que foi implementado
- **Editar (e "Nova conquista") rola a tela até o form e põe o cursor no título:** o formulário vive no **topo** da lista, então editar um card mais abaixo abria o form fora de vista. Agora há `formRef` no `Card` do form (com `scroll-mt-24` para o header fixo de 4rem não cobrir) e `titleRef` no `Input` do título, e um `useEffect` em `[showForm, editingId]` faz `scrollIntoView({ behavior: 'smooth', block: 'start' })` + `focus({ preventScroll: true })` (o `preventScroll` evita que o foco brusco cancele a rolagem suave).
- **`editingId` na dependência:** clicar em "Editar" em outro card com o form já aberto também recentraliza e refoca — não só na primeira abertura.
- O foco também vale para o botão **"Nova conquista"** (mesmo form, mesmo efeito) — o botão já fica no topo, então ali o ganho é só o cursor no título.

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npm run typecheck` ✓ · `npm run build` ✓ (14 rotas, `ƒ Proxy` ativo).

### Pontos de atenção
- `Card`/`Input` são componentes de função com `...props` no elemento (React 19) — `ref` chega neles sem `forwardRef`.
- Ao **salvar**, o form fecha e o foco não é devolvido a nada em especial (o `router.refresh()`/toast confirmam); se quiser, dá para focar o card salvo.
- Requer deploy para valer online.

---

## Cards de conquista do ADMIN sem expandir/colapsar (concluída — sem mudança de schema)

### O que foi implementado
- **O toggle de expandir/colapsar foi removido** do card de conquista em `/achievements` (visão ADMIN): saíram o **botão de chevron** (`ChevronDown`, que rotacionava com `expandedId`) e todo o estado `expandedId`/`setExpandedId` (inclusive a limpeza no `confirmDelete`).
- **A seção "Progresso por dependente" passou a ser renderizada sempre** (o wrapper `{expandedId === achievement.id ? … : null}` virou render direto): nome, chip de nível (`Nível N/máx`), contador `progresso/objetivo`, chip "Desbloqueada"/"Concluída" e — nas conquistas `MANUAL` — os botões **"−1"/"+1"** ficam visíveis sem nenhum clique.
- **Motivo:** o card já mostrava título, métrica, descrição e chips (objetivo/recompensa/multiplicador/repetibilidade/secreta) sempre; o único conteúdo escondido era o progresso por dependente, e esconder exigia um clique por conquista. Sem o estado, a lista fica com a altura total de uma vez.
- Import `ChevronDown` removido; `cn` segue em uso no resto do arquivo (chips e demais condicionais). Sem mudança de actions, schema ou dados.

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npm run typecheck` ✓ · `npm run build` ✓ (14 rotas, `ƒ Proxy` ativo).

### Pontos de atenção
- A lista de conquistas do ADMIN agora é mais longa (uma linha por dependente por conquista, sempre visível) — em casas com muitos dependentes e muitas conquistas a rolagem fica maior; a alternativa seria um agrupamento por conquista com acordeão, que é justamente o que foi removido.
- Requer deploy para valer online.

---

## Conquista sigilosa agora revela **individualmente** (corrigido — sem mudança de schema)

### O que foi encontrado e corrigido
- **Sintoma:** ao desbloquear **uma** conquista sigilosa, **todas** as outras da casa apareciam de uma vez (título, descrição e imagem), expondo o que deveria continuar oculto.
- **Causa raiz:** a condição de revelação era `achievement.is_secret && !progress` — bastava a linha existir em `dependent_achievements`. Mas `syncAchievementProgress` grava em **todas** as conquistas da casa com a métrica (comportamento correto para o progresso: 1 tarefa aprovada conta para toda conquista `TASKS_APPROVED`), criando a linha das secretas junto — ou seja, um único acesso ao app (`registerLoginDay` → `APP_LOGIN_DAYS`/`STREAK_LOGIN_DAYS` avaliam todas as conquistas da casa) já criava linhas para **todas** as secretas e as revelava em bloco, ainda com progresso parcial.
- **Correção (`achievements-dependent.tsx`):** a revelação passou a ser **individual** — `!achievement.is_secret || (progress && (progress.unlocked_at !== null || progress.level > 1))`. Ou seja, só o `unlocked_at` **daquela** conquista revela (e `level > 1` cobre a repetível já resgatada, para ela não desaparecer de novo no rollover do `claimAchievementReward`, que limpa o `unlocked_at`). A revelação continua chegando **instantânea** pelo Realtime de `dependent_achievements` (o `UPDATE` da linha trocou o card oculto pelo revelado).
- **Card oculto sem vazamento:** o card "Conquista secreta" não mostra mais o `icon`/`image_url` da conquista (mostrava o slug do próprio `AchievementIcon`) — agora é sempre um troféu genérico, coerente com o empty state.

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npm run typecheck` ✓ · `npm run build` ✓ (14 rotas, `ƒ Proxy` ativo).

### Pontos de atenção
- O desbloqueio de uma sigilosa **notifica** com o título (`ACHIEVEMENT_UNLOCKED` no sino) — isso é o próprio momento da revelação, então é coerente com o card.
- **Limite conhecido (aceito):** a revelação é de **exibição**. As linhas das conquistas (com título/descrição/imagem) continuam no payload RSC de `/achievements` para permitir a revelação instantânea pelo Realtime; quem inspecionar o payload vê as secretas. Blindar isso exigiria mascarar no servidor e buscar o conteúdo no desbloqueio (ou uma coluna `revealed_at`) — fora de escopo agora.
- Requer deploy para valer online.

---

## Item "Conquistas" da nav fica **dourado** quando há resgate disponível (concluída — sem mudança de schema)

### O que foi implementado
- **Regra única de "disponível para resgate":** novo helper puro **`isAchievementClaimable(progress, isRepeatable)`** (`src/utils/achievements.ts` — desbloqueado **e** ainda não resgatado: repetível → basta `unlocked_at` (resgatável a cada ciclo, vale nos níveis acima do cap); única → só no `level === 1`, mesma regra do guard `.eq('level', 1)` de `claimAchievementReward`). Passou a ser a fonte da verdade nos **cards do dependente** (substituiu o `unlocked && !claimed` inline), no cálculo do servidor e no badge da nav.
- **Badge dourado na navegação:** `DashboardNav` ganhou a prop **`hasClaimableAchievement?: boolean`**; quando verdadeira, o item `/achievements` fica **dourado** (`bg-amber-400 text-slate-900` no desktop; ícone com chip `bg-amber-400` + label `text-amber-300` na bottom nav) — com **prioridade sobre o destaque de item ativo** (condicionais via `cn`, não `data-*`, para não depender da precedência do CSS). Só o DEPENDENT recebe a prop (ADMIN não resgata → nunca dourado).
- **Cálculo no servidor:** `hasClaimableAchievement(profileId)` (`src/utils/achievement-progress.ts`, `React.cache` por request) — 1 query das linhas **já desbloqueadas** do dependente + 1 query da `is_repeatable` **das conquistas envolvidas** (não é derivável da linha de progresso). Entra no `Promise.all` que as telas já faziam, sem serializar: `/tasks`, `/rewards` e o layout `/dashboard/dependent`. Em `/achievements` **não há query extra** — a page reaproveita as `views` que já carrega e aplica o mesmo helper.
- **Instantâneo (store de aba):** `src/hooks/use-claimable-achievement.ts` — store de módulo (`useSyncExternalStore` + `setClaimableAchievements`), necessário porque o `AchievementsDependent` (que publica, por ter a lista completa com `is_repeatable`) e o `DashboardNav` são **irmãos** na page, sem ancestral comum. O `AchievementsDependent` publica o valor derivado a cada mudança (resgate otimista e Realtime de `dependent_achievements`) → **resgatando a última conquista o item volta ao normal no mesmo instante**, sem esperar `router.refresh()`. A prop do servidor realinha o store quando chega um valor novo (navegação entre telas).
- **Bônus de consistência na notificação de unlock:** `notifyUnlocked` passou a filtrar por `isAchievementClaimable` — uma conquista **única já resgatada** que o tutor re-desbloqueia não gera mais "Conquista desbloqueada!" (seria um desbloqueio sem recompensa possível).

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npm run typecheck` ✓ · `npm run build` ✓ (14 rotas, `ƒ Proxy` ativo).

### Pontos de atenção
- O dourado só cobre o **próprio item "Conquistas"** da nav; não há badge/ contador além disso (por decisão de escopo).
- Enquanto o dependente está **fora** de `/achievements`, um desbloqueio novo (ex.: o tutor concedendo `MANUAL`) acende o dourado na **próxima navegação** — o Realtime do `dependent_achievements` que atualiza o valor é assinado pelo componente de conquistas, que só existe nessa tela. Na tela de conquistas é instantâneo.
- Requer deploy para valer online.

---

## Conquista desbloqueada vai para a central de notificações (dependente + ADMINs) — decisão revertida (concluída — sem mudança de schema)

### O que foi implementado
- **Novo tipo de notificação `ACHIEVEMENT_UNLOCKED`** (18º tipo em `src/types/notifications.ts`): entra no sino (`TYPE_META` em `notifications-bell.tsx` — ícone `Trophy`, chip âmbar) e no toast (`TYPE_STYLE: 'success'` em `realtime-toast-listener.tsx`). **Sem SQL novo:** `notifications.type` é `text` sem CHECK no banco (só incluir o valor caso exista alguma constraint com CHECK).
- **Emissor no gargalo único de escrita:** `syncAchievementProgress` (`src/utils/achievement-progress.ts`) passou a detectar a transição **"sem `unlocked_at` → com `unlocked_at`"** em cada gravação confirmada e a notificar via `notifyUnlocked`: uma linha para o **dependente** ("Conquista desbloqueada!" / `Você desbloqueou "X". Vá resgatar a recompensa.`) e uma para os **ADMINs** da casa ("Conquista desbloqueada" / `Fulano desbloqueou "X".`), com `link: '/achievements'`. Best-effort (`try/catch` + `console.error`) — notificação nunca derruba a ação principal; o nome do dependente é resolvido **lazy** (query em `profiles` só quando houve desbloqueio).
- **Cobre todas as métricas:** automática (`TASKS_APPROVED`, `TASKS_REJECTED`, `REWARDS_CLAIMED`, `CUSTOM_REWARDS_APPROVED`, `APP_LOGIN_DAYS`, `STREAK_LOGIN_DAYS`), `EARNED_POINTS` e a **concessão/retirada manual** do tutor. Também cobre o **nascimento da linha já desbloqueada** (lazy insert em que o objetivo é atingido de primeira: ex.: `EARNED_POINTS` com muita pontuação) — a notificação só sai se o insert/update foi confirmado; e **não** dispara em `claimAchievementReward` (o rollover do resgate limpa o `unlocked_at`, não é desbloqueio).
- **Exclusão do autor (`actorId`):** o 5º param de `syncAchievementProgress` virou objeto de opções `{ onlyAchievementId?, actorId? }` (o `onlyAchievementId` do ajuste manual continuou, agora nomeado). O `actorId` é repassado por `registerAchievementProgress(…, actorId?)` → `incrementDependentStat(…, actorId?)` → `evaluateAchievements(…, actorId?)` e vale como `actor_id` da linha + `excludeUserId` do fã-out para os ADMINs (quem agiu **não** é notificado da própria ação). Os 5 call sites de ADMIN passaram a enviar `auth.adminId` (`approveTask`, `adminCompleteTask`, `rejectCompletedTask`, `approveRedemption`, `resolveRewardSuggestion`); `registerLoginDay` não envia (o próprio dependente é o autor no acesso diário, então os ADMINs são avisados normalmente). Sem `actorId`, o fallback é o próprio dependente.
- **Emenda de decisão (ADR-0015 estava "sem notificação"):** marcado como `~~strikethrough~~` + "Superado pela emenda (2026)" no ADR e nas três listas que afirmavam o contrário (`AGENTS.md` ×2, `PROJECT_STATUS.md`).

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npm run typecheck` ✓ · `npm run build` ✓ (14 rotas, `ƒ Proxy` ativo).

### Pontos de atenção
- **Mais de uma conquista desbloqueada na mesma ação → uma notificação por conquista** (ex.: uma aprovação que cruza um `TASKS_APPROVED` e um `EARNED_POINTS`); não há agrupamento.
- O **dependente sempre é notificado**, inclusive quando o gatilho foi ele mesmo (dias de acesso) — aqui a notificação é a recompensa em si, não "a outra parte da ação".
- Push: `notifyUser`/`notifyHouse` já disparam Web Push por conta própria (o dependente com o app fechado recebe push do desbloqueio).
- Requer deploy para valer online.

---

## Revisão de conquistas pelo tutor — a concessão manual passou a conceder **e retirar** (concluída — sem mudança de schema)

### O que foi implementado
- **A ação de concessão virou ajuste:** `grantAchievementProgress` foi renomeada para **`adjustAchievementProgress(achievementId, profileId, amount = 1)`** (`src/actions/achievements.ts`) e o `amount` passou a ser **inteiro com sinal** (`≠ 0`, `|amount| ≤ 1000`): **positivo concede** (comportamento anterior, 1–1000) e **negativo retira** progresso manual. A assinatura e as guardas de autorização seguem iguais — só ADMIN da casa ativa, conquista da casa com `metric_type='MANUAL'`, alvo `house_members.role='DEPENDENT'`.
- **Retirar tem piso 0 e revoga o desbloqueio:** `progress = max(0, atual − |amount|)` (nunca fica negativo) e, ao cair abaixo do objetivo, o **`unlocked_at` é limpo** — o dependente deixa de ter o botão de resgate (chega pelo Realtime de `dependent_achievements`, que já é subscription `UPDATE` por `house_id` em `achievements-dependent.tsx`).
- **Retirar exige progresso existente:** com `amount < 0`, a action lê a linha em `dependent_achievements` antes de gravar; sem linha (ou já em 0) devolve `ok:false` com mensagem clara em vez de deixar o lazy insert de `syncAchievementProgress` criar uma linha zerada.
- **O `level` nunca muda no ajuste** — é histórico de resgates, não progresso do ciclo (repetível continua mostrando `Nível N/máx` como está).
- **UI (`achievements/achievements-admin.tsx`):** no card de conquista `MANUAL`, a seção "Progresso por dependente" passou a ter **dois botões de ícone** (ambos `variant="outline"`, `h-7 w-7 p-0`, com `title` explicando a ação) — **"−"** (`Minus`, retirada) e **"+"** (`Plus`, concessão). O "−" só é renderizado quando o dependente **tem** linha de progresso e **desliga em 0**; no estado "Sem progresso" só o "+" aparece. O estado `grantingKey` virou `adjustingKey` (lock único, como antes) e o handler `handleGrant` virou `handleAdjust(achievement, profileId, delta: 1 | -1)`.
- **Resposta imediata (UI/UX):** o `+1`/`−1` **não exige mais recarregar a página** — a action agora **relê a linha e devolve o estado gravado** (`data.progress`: `level`/`current_progress`/`unlocked_at`, tipo `AchievementProgressSnapshot`) e a UI faz **atualização otimista + reconciliação**: aplica o delta no estado local no clique (barra/`N/N` e botão "−" mudam na hora) e, na resposta, sobrescreve com o valor autoritativo do servidor (destrava/oculta o chip "Desbloqueada" exatamente como ficou gravado); em erro (ou exceção) volta ao **snapshot** anterior e mostra o toast. O `onUpsert` do Realtime passou a reconciliar por `(achievement_id, profile_id)` (em vez de `id`) para substituir a linha otimista de `id` sintético quando o evento real chegar.
- **Sem mudança de schema** e sem SQL novo: usa as colunas que já existem (`current_progress`, `unlocked_at`, `level`).
- **Bug corrigido — o ajuste vazava para as outras conquistas da mesma métrica:** `syncAchievementProgress` grava em **todas** as conquistas da casa com o `metricType` (comportamento certo para os eventos automáticos: 1 tarefa aprovada conta para toda conquista `TASKS_APPROVED`), então um `+1` do tutor numa conquista `MANUAL` também incrementava as **outras** `MANUAL` da casa. `syncAchievementProgress` ganhou o 5º parâmetro opcional `onlyAchievementId` (filtra `.eq('id', …)` na query de conquistas) e `adjustAchievementProgress` passou a passá-lo: o ajuste é **escopado à conquista escolhida** (o resto do helper — lazy insert, guard `.eq('current_progress', …)` + 1 retry — inalterado, e as métricas automáticas seguem atualizando todas as conquistas da métrica).

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npm run typecheck` ✓ · `npm run build` ✓ (14 rotas, `ƒ Proxy` ativo). *Nota de ambiente: o `typecheck`/`build` falhavam com `TS2307` de `.next/dev/types/validator.ts` referenciando um route group `(dashboard)` inexistente — artefato stale de um `next dev` anterior; resolvido removendo `.next/dev` (gitignored), como manda o `AGENTS.md` §1.*

### Pontos de atenção
- Retirar é **revisão de histórico de desbloqueio**, não devolução de pontos: se o dependente **já resgatou** a conquista, os pontos ficam com ele (o `level` permanece) — só o progresso do ciclo em curso volta atrás.
- A ação continua chamando `revalidatePath('/achievements')`; o lado do dependente depende do Realtime (mesma premissa da concessão, que já contava com isso).
- Requer deploy para valer online.

---

## Comunicados / avisos da casa — rota `/dashboard/admin/comunicados` (implementado — SEM tempo real)

### O que foi implementado
- **Novo domínio de comunicados**: o ADMIN cria avisos para a casa ativa (título 1–120, descrição 1–500, agenda de repetição) e **publica** (`published`); os dependentes da casa **confirmam** em um overlay bloqueante. Sem cron — o "gatilho" é cálculo server-side na leitura.
- **SEM tempo real (decisão de produto, 2026):** o tempo real de publicar→ver era desproporcional ao esforço (ver histórico: Fase 1 do Realtime direto não entregava e a Fase 2 usava notificação como canal). **Abandonado.** O comunicado só aparece no **render server-side** das telas do dependente — ao **atualizar a página, trocar de endpoint** ou após confirmar (`refreshDue()`). O overlay não tem mais subscriptions Realtime (nem de `comunicados`, nem de `notifications`); a única subscription que resta é a do `comunicados-admin.tsx` (tela de gestão do próprio ADMIN). O tipo de notificação `COMUNICADO_PUBLISHED` foi **removido** (união em `src/types/notifications.ts`, `TYPE_STYLE` do toast e `TYPE_META` do sino).
- **1ª exibição em "slot de hoje ou próximo"** (regra do usuário — após o bug corrigido): não é mais sempre imediata à publicação. Num **dia agendado**, se o horário de hoje **já passou** o aviso aparece já no **próximo render**; se **ainda não chegou**, espera o **horário de hoje**. Em dia **não agendado**, aparece no **próximo dia agendado**. O **intervalo de repetição não conta** nesse primeiro ciclo. Repetição POR DEPENDENTE: cada confirmação agenda a próxima ocorrência (`last_confirmed_at`, somando o intervalo em dias, corta para o próximo weekday agendado e aplica o horário); ao completar `repeats_total` confirmações, para de aparecer. Helpers puros em **`src/utils/comunicados.ts`** (`recifeWeekday`/`nextComunicadoOccurrence`/`toDueComunicado`/`comunicadoSchedule`, módulo sem `'use server'`).
- **Tabelas novas (SQL em `docs/sql/comunicados.sql` — registro; **já aplicadas no banco** pelo usuário):**
  - **`comunicados`** — `house_id`, `title`, `description`, `published` (default false = rascunho), `repeats_total` (1–100, N confirmações exigidas), `repeat_interval_days` (0–365; contagem do período), `repeat_weekdays` (int[] default todos, dias 0(dom)..6(sáb) do **agendamento**), `repeat_time` (**`time` default `'08:00'`** — horário do agendamento em **America/Recife**), `created_by` (FK set null), timestamps.
  - **`comunicado_deliveries`** — `comunicado_id` (FK cascade), `profile_id` (FK cascade), `delivered_count`, `last_confirmed_at`; **UNIQUE (comunicado_id, profile_id)** — uma linha por (comunicado, dependente).
- **Server Actions (`src/actions/comunicados.ts`):** `createComunicado` / `updateComunicado` (whitelist) / `setComunicadoPublished` / `deleteComunicado` — ADMIN da casa ativa (`assertAdminCanManage`, service-role), validação fail-closed (`validateComunicadoFields`: título 1–120, descrição 1–500, repeats 1–100, intervalo 0–365, ≥1 weekday 0–6 sem duplicados, `repeatTime` `/^([01]\d|2[0-3]):[0-5]\d$/`); `getDueComunicados()` (só DEPENDENT com casa; `[]` para ADMIN/sem casa; publicados **com agenda devida** por dependente — a 1ª ocorrência usa `created_at` sem intervalo, as repetições `last_confirmed_at` com intervalo); `confirmComunicadoDelivery` (guarda em `delivered_count` + `.select('id')` + 2 tentativas, cap em `repeats_total`; `ok:false` quando recusa). Revalidam `/dashboard/admin/comunicados`; a confirmação revalida também as rotas do dependente.
- **UI ADMIN (`src/components/comunicados/comunicados-admin.tsx`)** em `/dashboard/admin/comunicados` (force-dynamic, role check + NoHouseCard): form criar/editar com chips de dia do agendamento + `<input type="time">` + repetição (total/intervalo), toggle **Publicar/Despublicar**, deletar com `Modal`, **Realtime de `comunicados`** (só a tela do ADMIN) e total de confirmações por aviso. Acesso pelo **card "Comunicados"** na visão geral do ADMIN (`/dashboard/admin`) — **sem item na nav** (ADMIN segue com 5 itens).
- **Overlay bloqueante do DEPENDENT (`src/components/alerts/alert-queue-overlay.tsx` — substitui `comunicado-overlay.tsx`, removido):** ver a seção **no topo** ("Fila de alertas única do dependente") — fila única FIFO de comunicados + penalização, sem prioridade para a penalização, e comprovação de leitura (≥ 3 palavras do aviso) no comunicado. Montagem nos mesmos 4 pontos: layout dependente e branches dependentes de `/tasks`, `/rewards`, `/achievements`.
- **Limpeza:** `comunicado_deliveries` fica **FORA** da publication e **sem policies client** (escritas/leituras service-role; o total do ADMIN atualiza via `revalidatePath`/`router.refresh()` pós-ação). `deleteComunicado` remove as deliveries (FK cascade); `deleteHouse` remove os comunicados (FK cascade em `comunicados`). Ver **ADR-0017**.

### SQL (docs/sql/comunicados.sql — já aplicado no banco)
```sql
-- Resumo (arquivo completo em docs/sql/comunicados.sql):
-- create table public.comunicados (… repeat_time time not null default '08:00:00' …);
-- create index … on public.comunicados (house_id);
-- create table public.comunicado_deliveries (… unique (comunicado_id, profile_id) …);
-- create index … on public.comunicado_deliveries (comunicado_id);
-- alter table … enable row level security (ambas);
-- (comunicado_deliveries SEM publication e SEM policies — service-role apenas.)
-- Policy de SELECT de `comunicados` e a publication Realtime NÃO são mais
-- necessárias (sem tempo real client): apenas as 2 tabelas + indices + RLS.
```

### Verificação
`npm run lint` ✓ (só warnings pré-existentes `no-img-element`/`House` unused nos pages de auth) · `npm run typecheck` ✓ · `npm run build` ✓ (13 rotas, `ƒ Proxy` ativo, `/dashboard/admin/comunicados` dinâmico).

### Pontos de atenção
- **Nada pendente no Supabase:** as 2 tabelas + índices + RLS já estão aplicados. A policy `comunicados_select_members` e a publication `comunicados`, se existirem no banco, ficam inofensivas — o app não depende delas (o overlay do dependente é sem tempo real).
- 1ª exibição em **"slot de hoje ou próximo"**: publicado num dia agendado com o horário **já passado** aparece de imediato no próximo render; **antes do horário**, espera o horário de hoje; dia **não agendado** → próximo dia agendado.
- Sem tempo real: o ADMIN não vê o balão "abrir na hora" no dependente — refletir o aviso exige atualizar a tela/trocar de endpoint no celular.
- Limite aceito: o total de confirmações do ADMIN não chega "ao vivo" (deliveries fora da publication) — atualiza via `revalidatePath`/`router.refresh()` pós-ação.
- **Requires deploy** para valer online.

### Histórico — por que não há tempo real (registro)
- **Fase 1 (descartada):** tentou-se o Realtime direto de `comunicados` (policy `comunicados_select_members` + publication). Mesmo com o SQL aplicado no banco, o canal **continuou não entregando** ao navegador do dependente (WAL + RLS + ingest opaco) — `SUBSCRIBED` chegava mas zero eventos.
- **Fase 2 (implementada, depois abandonada):** a 1ª exibição passou a usar `notifyHouse` com `type='COMUNICADO_PUBLISHED'` como sinal (canal `notifications` com entrega comprovada) + subscription em `notifications` no overlay. **Revertida por decisão de produto:** o usuário optou por abrir mão do tempo real — o comunicado deve aparecer apenas em refresh/troca de endpoint. Removido o sinal (`setComunicadoPublished` não notifica mais), a prop `userId`/subscription do overlay e o tipo `COMUNICADO_PUBLISHED`. O bug de 1ª exibição ignorar o horário também foi corrigido nessa passada (agora a 1ª exibição segue a regra "slot de hoje ou próximo").

---

## Ajustes de UI — conquistas do dependente e navegação do header (concluída — sem mudança de schema)

### O que foi implementado
- **Conquistas na visão do DEPENDENT (`achievements-dependent.tsx`):**
  - A **métrica deixou de ser exibida** — removido o subtítulo com `METRIC_LABEL[metric_type]` dos cards; os rótulos de `METRIC_LABELS` agora são usados **apenas** pela UI ADMIN (form e cards).
  - O **multiplicador por nível não aparece mais** para o dependente — removido o chip `×{mult} por nível` (continua visível só no form/configuração do ADMIN). A recompensa exibida (`+{N} pts`) segue sendo o valor real do nível atual (`achievementRewardAtLevel`).
  - **Destaque no título:** o nome da conquista ganhou `text-base font-bold text-slate-900` com `leading-snug` (antes `text-sm font-semibold`), virando o elemento principal do card após a saída do subtítulo.
- **Navegação do header em telas grandes (`dashboard-nav.tsx`):** a nav central de desktop deixou de ser `absolute left-1/2 -translate-x-1/2` (centralizada no **viewport**) e passou a ser item **in-flow** com `flex-1 justify-center` entre a marca e o cluster de ações — antes, em telas largas (container `max-w-5xl` centrado), a nav se estendia por cima do sino/pontos/avatar e sobrepunha o item **"Conquistas"** (último à direita).

### Verificação
`npm run lint` ✓ (só warnings esperados) · `npm run typecheck` ✓ · `npm run build` ✓ (13 rotas, `ƒ Proxy` ativo).

### Pontos de atenção
- Sem mudança de schema/banco/actions: ajustes client-side de exibição e layout.
- Requer deploy para valer online.

---

## Conquistas autônomas — estatísticas por dependente, métricas novas e concessão manual (concluída — SQL aplicado no banco)

### O que foi implementado
- **Novas métricas (união de 8 em `src/utils/achievements.ts`):** `TASKS_APPROVED`, `TASKS_REJECTED`, `REWARDS_CLAIMED`, `CUSTOM_REWARDS_APPROVED`, `APP_LOGIN_DAYS`, `STREAK_LOGIN_DAYS`, `EARNED_POINTS` (volátil, sem coluna) e `MANUAL` (concessão). **`COMPLETED_TASKS` foi renomeada para `TASKS_APPROVED`** (migração abaixo). Rótulos em `METRIC_LABELS` — usados pela **UI ADMIN** (select de métrica no form e nos cards); a visão do DEPENDENT não exibe a métrica (removida nos ajustes de UI).
- **`dependent_stats` (tabela nova, RLS sem policies):** uma linha por dependente+casa com `tasks_approved_count`, `tasks_rejected_count`, `rewards_claimed_count`, `custom_rewards_approved_count`, `app_login_days_count`, `streak_login_days`, `last_login_day`. Iniciadas **zeradas** (sem backfill). O mapa métrica→coluna vive em **`src/utils/dependent-stats.ts`** (módulo puro — valores não-função não saem de arquivos `'use server'`). Fora da publication Realtime (a UI continua via `dependent_achievements`, que segue na publication).
- **Dispatcher `registerAchievementProgress` (mesma assinatura — zero paralelismo):** `MANUAL` → no-op; `EARNED_POINTS` → soma incremental via `syncAchievementProgress`; demais → `incrementDependentStat` (lazy insert ou update atômico com guard `.eq(column, valor lido)` + 1 retry) e depois `evaluateAchievements`.
- **`evaluateAchievements` (superado — ver ADR-0019 no topo):** o repetível passou a ser **incremental no valor gravado**, com teto via `applyAchievementProgress` (antes: `contador − (nível−1) × objetivo`, que fazia a sobra reaparecer sozinha); a única segue `min(contador, objetivo)`; `unlocked_at` só marcado no cruzamento e quando ausente. Helper compartilhado `syncAchievementProgress` em `src/utils/achievement-progress.ts`.
- **Injeções (todas best-effort):** `approveTask`/`adminCompleteTask` → `TASKS_APPROVED` (1) + `EARNED_POINTS` (valor corrente, já com decay); **`rejectCompletedTask` → `TASKS_REJECTED`**; **`approveRedemption` → `REWARDS_CLAIMED`** (conta na aprovação); **`resolveRewardSuggestion` aprovado → `CUSTOM_REWARDS_APPROVED`**.
- **Dias de acesso (`registerLoginDay` em `src/actions/stats.ts`):** conta **1×/dia** (dia em **America/Recife**, `Intl` en-CA), idempotente por `last_login_day` (guard `.eq`/`.is null` contra duplicação de abas); streak = registrado ontem ? `+1` : 1. Disparado best-effort nos renders dependentes: layout `/dashboard/dependent` **e** branches dependentes de `/tasks`, `/rewards`, `/achievements`. Avalia `APP_LOGIN_DAYS` + `STREAK_LOGIN_DAYS`.
- **Concessão manual (`adjustAchievementProgress(achievementId, profileId, amount=1)`):** só ADMIN da casa ativa; exige conquista **`metric_type='MANUAL'`** da casa e membro `DEPENDENT`; `amount` inteiro **com sinal** (`≠ 0`, `|amount| ≤ 1000) — positivo concede, negativo **retira** (piso 0, revoga o `unlocked_at` ao cair abaixo do objetivo; ver seção "Revisão de conquistas pelo tutor" no topo). Ajusta via `syncAchievementProgress`. UX: botões **"+1"/"−1"** por dependente no card da conquista MANUAL em `/achievements` (ADMIN). *(O nome era `grantAchievementProgress` até a revisão do tutor.)*
- **Limpeza:** `expelMember`/`deleteDependentAccount`/`deleteHouse` (`src/actions/houses.ts`) agora removem também as linhas de `dependent_stats` no fluxo explícito.
- **Types:** `src/types/database.ts` reflete `dependent_stats` e a união nova de `metric_type` (não regenerado via CLI — espelho manual).

### SQL aplicado no Supabase (registro — aplicado pelo usuário com sucesso)
```sql
-- Conquistas autônomas: tabela de estatísticas por dependente+casa.
create table if not exists public.dependent_stats (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  house_id uuid not null references public.houses(id) on delete cascade,
  tasks_approved_count int not null default 0,
  tasks_rejected_count int not null default 0,
  rewards_claimed_count int not null default 0,
  custom_rewards_approved_count int not null default 0,
  app_login_days_count int not null default 0,
  streak_login_days int not null default 0,
  last_login_day date,
  updated_at timestamptz not null default now()
);
create index if not exists dependent_stats_house_idx on public.dependent_stats (house_id);
alter table public.dependent_stats enable row level security;
-- Sem policies de cliente: as leituras/escritas são service-role (ADR-0006).
-- NÃO incluir em supabase_realtime (a UI segue por dependent_achievements).

-- Migração: COMPLETED_TASKS virou TASKS_APPROVED (mesmo significado).
update public.achievements set metric_type = 'TASKS_APPROVED'
where metric_type = 'COMPLETED_TASKS';
```

### Verificação
`npm run lint` ✓ (só warnings esperados) · `npm run typecheck` ✓ · `npm run build` ✓ (13 rotas, `ƒ Proxy` ativo).

### Pontos de atenção
- **SQL aplicado e verificado no banco** — a tabela `dependent_stats` e a migração `COMPLETED_TASKS→TASKS_APPROVED` estão vivas; as métricas contadas já registram progresso e conquistas antigas apontam para a métrica nova.
- ~~**Limitação documentada (ADR-0016):** no cap (`max_level`), o rollover subtrai o objetivo/ciclo mas a fórmula usa o nível travado → ciclos consumidos no cap são **subestimados**, desbloqueando um pouco antes~~ **Superado pelo ADR-0019 (seção no topo):** o repetível não usa mais `contador − (nível−1) × objetivo`, então no cap cada ciclo custa o objetivo inteiro e o desbloqueio acontece sempre no ponto certo; a recompensa paga continua sendo a do nível travado.
- `EARNED_POINTS` segue sem coluna: é a única métrica que depende do valor corrente na aprovação, não de um contador da casa.
- Requer deploy para valer online.

---

## Conquistas — imagem como ícone, nível máximo configurável e multiplicador por nível (concluída — SQL aplicado no banco)

### O que foi implementado
- **Imagem como ícone:** as `achievements` ganharam a coluna `image_url`; no form do ADMIN há novos **chips de slug + `ImageUpload`** (pasta `achievements/` no bucket `casasync-media`, owner = `house_id`). Quando `image_url` está definida, **substitui o ícone de símbolo** nos cards (ADMIN e dependente; conquistas **secretas** não desbloqueadas continuam ocultas, sem revelar a imagem). `deleteAchievement` remove a imagem do storage **best-effort** (`removeAchievementImage`).
- **Nível máximo configurável (`max_level`, default 10):** campo "Nível máximo (repetível)" no form (1–1000, desabilitado para conquistas únicas). **A cada ciclo o dependente ganha 1 nível**; ao atingir o cap, a conquista **segue repetível** — o nível fica travado no máximo e a recompensa daquele nível é paga a cada novo ciclo. Conquista **única** continua resgatando só no nível 1 (server clampa `max_level = 1` quando `is_repeatable = false`).
- **Multiplicador por nível (`level_multiplier`, numeric default 1):** `recompensa no nível N = reward_points × N × level_multiplier` (helper puro `achievementRewardAtLevel` em `src/utils/achievements.ts`, redondado). O crédito do resgate (`claimAchievementReward`) usa o valor do **nível atual** do dependente; a UI dependente mostra a recompensa por nível (`+{N} pts`) — o multiplicador **não é exibido** para o dependente, só no form/visão do ADMIN.
- **Sem mudança em `dependent_achievements`:** `level`/`current_progress`/`unlocked_at` seguem como estão; o cap fica só na leitura (helper `maxAchievementLevel`).

### SQL aplicado no Supabase (registro — aplicado pelo usuário com sucesso)
```sql
-- Conquistas: ícone por imagem + níveis (cap + multiplicador de pontos por nível).
alter table public.achievements add column if not exists image_url text;
alter table public.achievements add column if not exists max_level int not null default 10;
alter table public.achievements add column if not exists level_multiplier numeric not null default 1;
-- Opcional: meter o multiplicador de conquistas antigas repetíveis em 1 (default já é 1).
```
### Verificação
`npm run lint` ✓ (só warnings `no-img-element` + `'House' unused` esperados nos pages de auth; os `<img>` novos são deliberados) · `npm run typecheck` ✓ · `npm run build` ✓ (13 rotas, `ƒ Proxy` ativo, `/achievements` dinâmico).

### Pontos de atenção
- **As 3 colunas já estão no banco** (aplicadas pelo usuário com o restante do SQL) — o runtime de conquistas opera com `image_url`/`max_level`/`level_multiplier` nas ações e na UI.

---

## Conquistas gamificadas por casa — rota `/achievements` (concluída — 2 tabelas novas já aplicadas no banco)

### O que foi implementado
- **Novo domínio de conquistas por casa:** o ADMIN define **conquistas** para a casa ativa (título ≤100, descrição opcional, ícone, recompensa em pontos, objetivo, métrica, repetível/secreta) e o progresso do dependente é registrado **automaticamente nas aprovações de tarefas**; o dependente vê a meta (barra de progresso) e **resgata** a recompensa quando desbloqueia.
- **Tabelas novas (SQL abaixo — aplicado pelo usuário):**
  - **`achievements`** — `house_id`, `title`, `description`, `icon`, `metric_type`, `reward_points`, `target_count`, `is_repeatable`, `is_secret`, `created_by`.
  - **`dependent_achievements`** — `house_id`, `achievement_id` (FK), `profile_id` (FK), `level`, `current_progress`, `unlocked_at`. Uma linha por (conquista, dependente); `level` sobe a cada resgate.
- **Server Actions (`src/actions/achievements.ts`):**
  - `createAchievement` / `updateAchievement` (patch whitelist; progressão já registrada **não** é recalculada retroativamente) / `deleteAchievement` — ADMIN da casa ativa (`assertAdminCanManage`), validação fail-closed (`validateAchievementFields`), revalidam `/achievements`.
  - **`registerAchievementProgress(houseId, profileId, metricType, amount)`** — chamada em `approveTask` e `adminCompleteTask` pelo próprio fluxo de crédito: `amount` = 1 por tarefa aprovada (`COMPLETED_TASKS`) ou o **valor corrente creditado** (já com `task_decay`) para `EARNED_POINTS`. **Best-effort** (try/catch; falha nunca derruba o crédito): **lazy insert** para conquistas sem linha (nível 1, `unlocked_at` se `amount >= target_count`) e **update atômico por linha com guard `.eq('current_progress', valor lido)` + 1 retry relendo** — duas aprovações concorrentes não perdem incremento. `current_progress` **não é capado no banco** (a UI capa a barra em 100%).
  - **`claimAchievementReward(achievementId)`** — só DEPENDENT da própria casa; **credita `reward_points` direto em `profiles.points`** (mesmo ajuste de `approveTask`). Repetível: `level+1`, ~~**rollover** `max(0, progress − target)`~~ **superado (ADR-0019):** o ciclo novo grava **`current_progress = 0`** (o ciclo exige o objetivo inteiro de novo) e `unlocked_at` volta a null (re-desbloqueia no próximo ciclo); **não repetível**: resgata **uma vez** no nível 1 (guard `.eq('level', 1)`), depois vira chip "Concluída" e o botão some. Guards anti-race (`unlocked_at` lido no repetível, `level` no não repetível) + **rollback da linha** se o crédito de pontos falhar. Revalida `/achievements`, `/rewards`, `/dashboard/dependent`.
- **Rota `/achievements`** (role-aware, service role com escopo de sessão — padrão ADR-0006): ADMIN vê conquistas + **progresso por dependente**; DEPENDENT vê as próprias metas. Carregada via `listAchievements`/`getAchievementProgress` (dados iniciais) e alimentada por **Realtime** (`achievements` + `dependent_achievements`, filter `house_id`).
- **UI:** `achievements/achievement-icon.tsx` (`AchievementIcon` + `ICON_MAP`, 12 slugs Lucide), `achievements/achievements-admin.tsx` (form de criação/edição controlado com chips de ícone + checkboxes repetível/secreta, seção de progresso por dependente por card, delete com `Modal` de confirmação; sem `router.refresh` — Realtime cobre), `achievements/achievements-dependent.tsx` (cards com barra/pill "N/N"; secreta não desbloqueada → card oculto "Conquista secreta" que só revela ao desbloquear; `handleClaim` otimista + `router.refresh()`).
- **Nav:** item **"Conquistas"** (ícone `Trophy`) adicionado em `dashboard-nav.tsx` (ADMIN tem **5** itens; DEPENDENT **4** — o slot extra da bottom nav só existe com `< 4` itens).
- **Limpeza:** exclusão de conquista apaga o progresso (FK `on delete cascade` no SQL); `expelMember`/`deleteDependentAccount`/`deleteHouse` (`src/actions/houses.ts`) removem linhas de `dependent_achievements` (e `deleteHouse` remove as `achievements` da casa) no fluxo de limpeza.
- **Decisões de escopo (ADR-0015):** progresso conta apenas **aprovações** (não débitos); `EARNED_POINTS` conta só créditos de tarefa aprovada (sem loop com resgates de recompensa); **notificação `ACHIEVEMENT_UNLOCKED` no desbloqueio** (dependente + ADMINs da casa, autor excluído dos ADMINs — ver seção no topo do documento; as *decisões originais* diziam "sem notificação", superadas); `restoreTask`/`adminCompleteTask` no caminho do crédito também registram/registram progresso apenas no crédito real.

### SQL aplicado no Supabase (registro — o usuário aplicou com sucesso; verificado via probe: tabelas existem e um insert service-role reversível passou)
```sql
-- Conquistas: tabelas novas do módulo gamificado.
create table if not exists public.achievements (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  title text not null,
  description text,
  icon text,
  metric_type text not null,
  reward_points int not null default 0,
  target_count int not null default 1,
  is_repeatable boolean not null default false,
  is_secret boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists achievements_house_idx on public.achievements (house_id);

create table if not exists public.dependent_achievements (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  achievement_id uuid not null references public.achievements(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  level int not null default 1,
  current_progress int not null default 0,
  unlocked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists dependent_achievements_house_idx on public.dependent_achievements (house_id);
create index if not exists dependent_achievements_achievement_idx on public.dependent_achievements (achievement_id);
create index if not exists dependent_achievements_profile_idx on public.dependent_achievements (profile_id);

alter table public.achievements enable row level security;
alter table public.dependent_achievements enable row level security;

-- Realtime: as ações/leituras são service-role (ADR-0006), mas o browser (DEPENDENT
-- na própria linha / ADMIN da casa) precisa de SELECT por membro + publication.
create policy "achievements_select_members" on public.achievements
  for select to authenticated
  using (exists (
    select 1 from public.house_members hm
    where hm.house_id = achievements.house_id
      and hm.profile_id = auth.uid()
  ));

create policy "dependent_achievements_select_members" on public.dependent_achievements
  for select to authenticated
  using (exists (
    select 1 from public.house_members hm
    where hm.house_id = dependent_achievements.house_id
      and hm.profile_id = auth.uid()
  ));

alter publication supabase_realtime add table public.achievements;
alter publication supabase_realtime add table public.dependent_achievements;
```

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` + `'House' unused` esperados nos pages de auth) · `npm run typecheck` ✓ · `npm run build` ✓ (13 rotas, `ƒ Proxy` ativo, `/achievements` dinâmico).

### Pontos de atenção
- As 2 tabelas **já estão no banco** (aplicadas pelo usuário e verificadas via probe: `SELECT` anônimo retornou 200 e um insert service-role reversível passou com o payload exato de `createAchievement`; a action e a rota rodam).
- **Bug de import corrigido:** `ACHIEVEMENT_ICONS`/`ACHIEVEMENT_METRIC_TYPES`/`AchievementMetricType` saíram de `src/actions/achievements.ts` para **`src/utils/achievements.ts`** (módulo puro). Exports não-função de arquivo `'use server'` **não são transmitidos** a client components → `ACHIEVEMENT_ICONS.map is not a function` no `achievements-admin.tsx` em runtime (`tsc`/`build` não pegam). As actions seguem em `src/actions/achievements.ts`.
- **Requer deploy** para valer online.
- Índices/`level` inicial já contemplados no SQL; o progresso de quem já está na tabela é preservado (nada é re-insertado com dedup por `achievement_id`+`profile_id` — o registro é lazy).
- Sem mudança nas demais features; `rewards.active`/mensagem rápida/`house_settings` seguem como documentado.

---

## Exclusão real de conta de dependente — "Excluir conta" substitui "Expulsar" para DEPENDENT (concluída — sem mudança de schema)

### O que foi implementado
- **Nova Server Action `deleteDependentAccount(houseId, targetUserId)`** (`src/actions/houses.ts`): só o **autor da casa** (`getOwnedHouse`) exclui a conta **completa** de um membro `DEPENDENT`. Limpeza em **ordem explícita** (sem depender de cascade):
  1. tarefas ativas (`PENDING/IN_PROGRESS/NOT_DELIVERED/ON_HOLD`) do dependente → delete;
  2. tarefas `COMPLETED/APPROVED` da casa → **MANTIDAS** e apenas **desatribuídas** (`assigned_to`/`completed_by` → null) — histórico pertence à casa;
  3. resgates (pendentes e resolvidos) → delete (`reward_redemptions.profile_id` é NOT NULL — sem migração, o log de resgate não tem como ser retido);
  4. sugestões, notificações (`recipient_id`) e push subscriptions → delete;
  5. arquivos do dependente no bucket (`avatars/<id>/` + `messages/<id>/`) → **best-effort** (`deleteMemberStorage`);
  6. membresias e perfil (`profiles`, incluindo os pontos globais) → delete;
  7. `admin.auth.admin.deleteUser` **por último** (se falhar, sobra conta sem perfil que não passa nos checks de role).
- **Por que existe:** expulso, o dependente vira **órfão** — o login continua válido, vê "sem casa", e o `username` único fica ocupado para sempre, sem caminho no app para re-vincular. Excluir a conta (auth + perfil) remove o lixo e libera o username.
- **UI (`houses-manager.tsx`):** para membro `DEPENDENT`, visível só ao autor (fora da própria linha), o botão vermelho passou de "Expulsar" para **"Excluir conta"** (`Trash2`) com `Modal` de confirmação avisando da irreversibilidade e de que o histórico da casa é preservado. Co-ADMINs seguem com "Expulsar" (`expelMember`); **conta de ADMIN nunca é excluída**.
- **Sem mudança de schema:** tudo coberto por colunas/ordens existentes (nuláveis de `tasks`, cascades de `notifications`/`push_subscriptions`, `house_settings.updated_by` set null).

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` + `'House' unused` esperados nos pages de auth) · `npm run typecheck` ✓ · `npm run build` ✓ (12 rotas, `ƒ Proxy` ativo).

### Pontos de atenção
- **Requer deploy** para valer online.
- **Trade-off documentado (ADR-0014):** resgates resolvidos do dependente excluído são removidos — se um dia o log de resgates do excluído precisar ser retido, a evolução é tornar `reward_redemptions.profile_id` nulável com `on delete set null` (migração opcional, fora de escopo hoje).
- Excluir é **permanente e imediato**: conta de login + perfil + pontos somem; tarefas concluídas/aprovadas da casa permanecem sem atribuição.

---

## ADMIN autor da casa — chip "A", expulsar membros, trocar PIN e excluir a casa (concluída — sem mudança de schema)

### O que foi implementado
- **Autor = criador (`houses.owner_id`), diferenciado do co-ADMIN** que entrou via PIN. Novas verificações exclusivas do autor usam o helper **`getOwnedHouse`** (`src/actions/houses.ts`): carrega a casa apenas quando `houses.owner_id === user.id` — nunca por parâmetro público.
- **Novas Server Actions** (todas exigem sessão ADMIN + ser o autor):
  - **`expelMember(houseId, targetUserId)`** — o autor expulsa um co-ADMIN ou dependente. Apaga os dados **ativos** do expulso na casa (tarefas `PENDING`/`IN_PROGRESS`/`NOT_DELIVERED` atribuídas, resgates `PENDING` e sugestões) e mantém o **histórico** (tarefas concluídas/aprovadas e resgates resolvidos). `profiles.points` é global e fica intacto. Guardas: não pode se expulsar; alvo precisa ser membro da casa.
  - **`rotateHousePin(houseId)`** — gera um novo `houses.code` único (mesmo `generateUniqueCode` da criação) e devolve `data: { code }`; o PIN antigo deixa de valer para novos ingressos via `joinHouseByPin`, membresias existentes não são afetadas.
  - **`deleteHouse(houseId)`** — só quando o autor é o **único membro restante** (`count` em `house_members` ≤ 1, casa "vazia"). Exclui os dados da casa em ordem explícita (tarefas, resgates, sugestões, recompensas, notificações, `house_settings`, `house_members`, casa) **sem depender de cascade** no banco; `push_subscriptions` é deixado ao cascade documentado (`house_id on delete cascade`). Se a casa excluída era a ativa, o cookie `ACTIVE_HOUSE_COOKIE` é zerado (fallback do `getActiveAdminHouse`).
- **`src/utils/house.ts`:** `ActiveHouse` e `getAdminHouses` passaram a incluir `owner_id` (select `houses ( id, name, image_url, code, owner_id )`); `getDependentHouse` também traz `owner_id` para casar com o tipo.
- **Página `/dashboard/admin/houses`:** passa `currentUserId` e `activeHouseOwnerId` ao `HousesManager`.
- **UI (`houses-manager.tsx`):**
  - **Chip discreto "A"** (âmbar, `title="Autor da casa"`) ao lado do nome no card da casa **e** no membro que é o autor da casa ativa.
  - As opções exclusivas do autor vivem **dentro do menu "Editar casa"** (seção "Ações do autor", abaixo do formulário): **"Alterar PIN da casa"** (`RefreshCw` — troca o PIN, toast mostra o novo código) e **"Excluir casa"** (`Trash2`, vermelho). Nos cards, casas próprias e co-geridas têm apenas copiar PIN + editar.
  - Na lista de membros, quando o usuário é o autor da casa ativa, cada membro que **não** é o autor ganha o botão **"Expulsar"** (`UserMinus`, vermelho).
  - Novo `Modal` de confirmação (estado `ConfirmAction` + `dialog` "Excluir casa" / "Expulsar — {nome}") com aviso do efeito (excluir remove a casa toda; expulsar apaga dados ativos e mantém histórico), feedback **inline** + toast e `router.refresh()` pós-ação. **"Não pode abandonar a casa"** não foi implementado como ação nova: o autor simplesmente não tem botão de saída (decisão do usuário — não adicionar "sair" agora).

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` + `'House' unused` esperados nos pages de auth) · `npm run typecheck` ✓ · `npm run build` ✓ (12 rotas, `ƒ Proxy` ativo).

### Pontos de atenção
- **Requer deploy** para valer online.
- **Co-ADMIN (pela PIN) não enxerga as ações de autor:** chip "A" apenas nas casas em que é `owner_id`; sem expulsar/trocar PIN/excluir fora da própria casa.
- Exclusão exige **expulsar os demais membros primeiro** (a action devolve erro claro se ainda houver membros). Dependências de dados são removidas em ordem explícita — as FKs de `tasks`/`rewards`/`reward_redemptions`/`reward_suggestions`/`notifications`/`house_settings`/`house_members` são cobertas manualmente; apenas `push_subscriptions` conta com o cascade.

---

## PIN de pontos = PIN da casa (o "PIN_PTS" de env foi removido — concluída, sem mudança de schema)

### O que foi implementado
- **A env server-only `PIN_PTS` deixou de existir:** a autorização da alteração manual de pontos passou a ser o **próprio PIN da casa** (`houses.code`) — o mesmo código de convite exibido em "Suas casas" (que o autor pode trocar em `/dashboard/admin/houses`). Nada de env nova; menos estado de configuração.
- **`updateDependentPoints` (`src/actions/houses.ts`):** após validar sessão ADMIN, `validatePoints` e as membresias (alvo `DEPENDENT` de casa que o ator controla), busca o `houses.code` da casa do dependente e compara com o PIN digitado **normalizado como `joinHouseByPin`** (trim + uppercase, fail closed) — `"PIN de pontos inválido."` quando não confere. Reajuste para valor menor (penalização) continua exigindo motivo e notifica via `PENALTY`.
- **UI (`houses-manager.tsx`):** o modal "Alterar pontos" mudou o campo para **"PIN da casa"** (hint: "o mesmo código exibido em 'Suas casas'"); input continua password, **uncontrolled**, lido via `FormData` (ADR-0003).
- **Docs sincronizadas:** `AGENTS.md`, `README.md`, `.opencode/command/context.md` e `ADR-0012` atualizados (a env `PIN_PTS` some das listas; o `MASTER_PIN` continua existindo, validando apenas o cadastro de ADMIN).

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` + `'House' unused` esperados nos pages de auth) · `npm run typecheck` ✓ · `npm run build` ✓ (12 rotas, `ƒ Proxy` ativo).

### Pontos de atenção
- **Requer deploy** para valer online.
- Quem controla a casa já conhece o PIN — a confiança passa a ser o código único da casa; **trocar o PIN (`rotateHousePin`) também invalida o "PIN de pontos"**.
- A seção histórica "Alteração de pontos de dependente pelo ADMIN via PIN_PTS" abaixo descreve o comportamento **anterior**; este bloco é o estado atual.
- Sem mudança de schema/banco: `houses.code` sempre existiu.

---

## Ajuste de pontos em tempo real no dependente — listener alinhado ao ADR-0010 (concluída — sem mudança de schema)

### O que foi implementado
- **Novo `RealtimePointsListener`** (`src/components/dashboard/realtime-points-listener.tsx`): componente cliente que mantém a tela do DEPENDENT sincronizada quando o ADMIN mexe em `profiles.points` (`updateDependentPoints` com o PIN da casa, penalidade, reajuste). Assina UPDATE na própria linha do perfil (`table: 'profiles'`, `filter: id=eq.<userId>`) e, a cada evento, chama `router.refresh()` para regenerar os Server Components com o novo saldo (badge de pontos do `DashboardNav` e cards).
- **Alinhamento obrigatório com ADR-0010:** o listener usa o hook compartilhado **`usePostgresChanges`** — NÃO abre um `supabase.channel()` cru. Sem `getSession()` + `realtime.setAuth(access_token)` antes de assinar, com a sessão restaurada de cookies/storage o socket conecta como `anon`, o RLS descarta os eventos em silêncio e o saldo nunca atualizaria sozinho. O hook cuida disso, do nome único de canal e do cleanup.
- **Wiring no layout dependente** (`src/app/dashboard/dependent/layout.tsx`): `<RealtimePointsListener userId={user.id} />` adicionado junto dos demais listeners (`RealtimeToastListener`, `PushNotificationsSetup`, `PushPermissionPrompt`); import reordenado com os componentes (o commit anterior o deixava após o import de tipo). O saldo do `DashboardNav` (que já chega do servidor via `points={profile?.points}`) passa a atualizar em tempo real.
- **Estilo alinhado:** `penalty-dialog.tsx` e o listener refatorados para a indentação de 2 espaços do projeto (o dialog do commit de origem usava 4). Sem mudança de schema — feature client-side pura.

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npm run typecheck` ✓ · `npm run build` ✓ (12 rotas, `ƒ Proxy` ativo).

### Pontos de atenção
- **Requer deploy** para valer online (arquivo novo + layout). O listener só vive no layout dependente (`/dashboard/dependent`) — nas páginas `/tasks` e `/rewards` o dependente segue atualizando via `router.refresh()` pós-ação/Realtime dos próprios fluxos.
- O `useProfilePoints` existente (`rewards-dependent.tsx`) continua cobrindo o saldo local do card da loja; o `RealtimePointsListener` complementa cobrindo o resto da tela do dashboard.

---

## Penalização de dependente pelo ADMIN (concluída — sem mudança de schema)

### O que foi implementado
- **Nova funcionalidade:** ADMIN pode penalizar um dependente subtraindo pontos do saldo acumulado via `updateDependentPoints`. A penalização **só ocorre em reajuste negativo** (SET para valor menor que o atual) e **exige motivo/descrição**.
- **Server Action `updateDependentPoints`** (`src/actions/houses.ts:617`):
  - Valida o **PIN da casa** (`houses.code`) da casa do dependente (fail-closed; ver seção "PIN de pontos = PIN da casa" no topo).
  - Calcula `pointsDeducted = currentPoints - newPoints`.
  - Se `pointsDeducted > 0` **exige `reason` não-vazio** (retorna erro se omitido).
  - Envia notificação `type='PENALTY'` via `notifyUser` para o dependente: título "Penalidade Aplicada", body "`-X pt(s) · Motivo: Y`", link `/dashboard/dependent`.
  - Revalida `/dashboard/dependent` para o dependente ver saldo atualizado.
- **UI ADMIN (`houses-manager.tsx:853-932`):** Modal "Alterar pontos" já continha campo "Descrição do ajuste" (`reason`) e PIN de pontos. O submit passa `reason` para a action.
- **Notificação para o dependente:**
  - **Toast em tempo real** (`realtime-toast-listener.tsx:25`) — exibe "Penalidade Aplicada" com detalhes.
  - **Balão flutuante persistente** (`penalty-dialog.tsx`, **removido** — hoje a penalização entra na fila única de alertas, ver a seção no topo) — era um modal não fechável por backdrop/Esc; só fechava ao clicar "Compreendi" (marcava como lida via `markNotificationRead`). Parseava o body para exibir pontos e motivo.
  - **Sino de notificações** (`notifications-bell.tsx:67`) — tipo `PENALTY` com ícone Flame, chip vermelho.
- **Layout dependente** (`dashboard/dependent/layout.tsx`) — hoje monta o `AlertQueueOverlay` (que monitora comunicados e notificações `PENALTY` não lidas, inicial + Realtime). **Histórico:** antes incluía o `PenaltyDialog`, que foi removido.

### Verificação
`npm run lint` ✓ (só warnings esperados) · `npm run typecheck` ✓ · `npm run build` ✓ (13 rotas, `ƒ Proxy` ativo).

---

## Botão "Concluir e creditar" oculto durante edição de campos (corrigido — sem mudança de schema)

### O que foi implementado
- **Problema:** durante a edição dos campos de uma tarefa (título, descrição, pontos, prazo), o botão verde **"Aprovar Tarefa e Creditar"** permanecia visível no card expandido. O admin podia clicar achando que era o botão "Salvar", quando na verdade ele credita pontos e aprova a tarefa.
- **Solução:** o `DebouncedField` já expunha `onSavingStatusChange('saving' | 'saved' | 'idle')`. Faltava ligar esse callback nos campos **Título** e **Descrição** (já existia em Pontos e Prazo).
- **Mudanças:**
  - `tasks-admin.tsx`: adicionado `onSavingStatusChange` nos `DebouncedField` de título e descrição, atualizando `savingStatuses[task.id]`.
  - O JSX condicional (já existente) oculta o botão "Aprovar Tarefa e Creditar" e "Marcar como não entregue" enquanto o status for `'saving'` ou `'saved'`, exibindo "⏳ Salvando alterações..." / "✓ Alterações salvas" no lugar.

### Pontos de atenção
- **A janela do "✓ Alterações salvas" é hoje a constante `SAVED_FEEDBACK_MS`** (topo do `debounced-field.tsx`), ajustável para cima ou para baixo — ver a seção no topo do documento. Antes era um literal solto no `setTimeout`.
- **O botão "Colocar em espera" também some** durante a edição, pela mesma condição (`savingStatuses[task.id] === 'idle'`), embora não tenha sido esse o problema relatado aqui.

### Verificação
`npm run lint` ✓ (só warnings esperados) · `npm run typecheck` ✓ · `npm run build` ✓ (13 rotas, `ƒ Proxy` ativo).

---

## Mensagem rápida: retenção por tempo após leitura (concluída — sem mudança de schema)

### O que foi implementado
- **Regra antiga removida:** "2 lidas → apaga a mais antiga" (capacity-based). A regra era: quando o dependente atingia `capacity` (default 2) mensagens **já lidas**, a mais antiga era apagada.
- **Nova regra (tempo):** assim que **ao menos um tutor (admin)** visualiza a mensagem rápida (qualquer cópia com `read_at != null`), o grupo inteiro (todas as cópias dos admins + cópia do dependente + imagem no storage) é apagado **após `readRetentionDays` dias**. Mensagens **nunca lidas** por nenhum tutor ficam armazenadas indefinidamente (não expiram).
- **Configurável pelo ADMIN:** novo campo **"Expira após leitura"** (dias, 1–365) no card **Mensagem rápida** em `/dashboard/admin/settings`. Default `5` dias (mesmo padrão de `notification_retention`).
- **Código:** 
  - `QuickMessageSettings` ganha `readRetentionDays` (`src/utils/settings.ts`).
  - `validateQuickMessage` valida 1–365 (`src/actions/settings.ts`).
  - `cleanupQuickMessages` reescrita para regra de tempo (`src/utils/notifications.ts`).
  - Chamadas atualizadas em `markNotificationRead`, `markAllNotificationsRead` (`src/actions/notifications.ts`).
  - Limpeza lazy em `getMyNotifications` para pegar mensagens que venceram o prazo mesmo sem nova leitura.
- **Capacity** continua só como limite de envio (dependente só envia enquanto tem < capacity mensagens acumuladas).

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` + `'House' unused` nos pages de auth) · `npm run typecheck` ✓ · `npm run build` ✓ (13 rotas, `ƒ Proxy` ativo).

---

## Tarefa criada/reativada não aparecia na UI até refresh manual (corrigido — sem mudança de schema)

### O que foi implementado
- **Causa:** criar tarefa (`handleCreate` novo) e reativar via form ("Reativar tarefa existente") **não tinham atualização otimista** — só `router.refresh()` + Realtime faziam a tarefa aparecer. Se o Realtime não entregasse (RLS/publication) ou o browser estivesse com o Service Worker antigo servindo payload RSC obsoleto, a UI ficava sem o card até um refresh manual. Todos os demais handlers (aprovar, reativar/card, não entregue) já usavam otimismo.
- **Actions devolvem a linha:** `createTask` agora faz `.select('*').single()` e retorna `data: { task }`; `restoreTask` faz `.select('*').single()` (guarda `.eq('status','APPROVED')` preservada) e retorna `data: { task }` com o estado real (inclui `due_date` + `decay_started_at` do servidor). `ActionResult` virou genérico (`ActionResult<T>`) com `data?: T` no ramo `ok`.
- **`tasks-admin.tsx` otimista nos 3 fluxos:** criação nova, reativação via form e o botão Restaurar do card inserem/substituem a tarefa no estado local via `upsertTask` **(dedup por id** — se o Realtime entregar o mesmo evento depois, não duplica) usando a linha devolvida pela action. O `router.refresh()` continua como confirmação/refinamento; `resetForm()`/toast inalterados.

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` + os `'House' unused` pré-existentes nos pages de auth) · `npm run typecheck` ✓ · `npm run build` ✓ (13 rotas, `ƒ Proxy` ativo).

### Pontos de atenção
- **Requer deploy.** No browser com SW antigo (v1/v2, que cacheia RSC), a UI continua a precisar de uma recarga extra até o `sw.js` v3 ativar e purgar o cache — este fix elimina a dependência disso para o ADMIN que age: o card aparece na hora.
- Sem mudança de schema: só retorno das actions + estado otimista no cliente.

---

## Dependente pré-selecionado na criação de tarefa quando a casa tem 1 só dependente (concluída — sem mudança de schema)

### O que foi implementado
- **Em `tasks-admin.tsx`, o select "Dependente" do form de nova tarefa pré-seleciona o único dependente** quando a casa tem exatamente 1: `defaultAssignee = assignees.length === 1 ? assignees[0].id : ''` (constante derivada antes dos hooks). Aplicado no estado inicial (`useState(defaultAssignee)`), no `resetForm` e no fallback do autocomplete (`applySuggestion` usa `task.assigned_to ?? defaultAssignee` — tarefa sugerida sem atribuição volta ao único dependente). Com 2+ dependentes, o comportamento continua "Selecionar...".

### Verificação
`npm run lint` ✓ (só warnings esperados) · `npm run typecheck` ✓ · `npm run build` ✓ (13 rotas, `ƒ Proxy` ativo).

---

> **Banco de dados sincronizado:** **todos** os scripts/enums SQL citados neste documento — coluna `profiles.username`, colunas `image_url` (incluindo `rewards.active` e `notifications.image_url`/`message_id` da mensagem rápida), tabela `reward_suggestions`, flags `extension_*`, enum `task_status` com `NOT_DELIVERED`, tabela `notifications`, policies de leitura, publication Realtime, tabela `house_settings` (+ policy de SELECT por membro), bucket público `casasync-media`, **`tasks.decay_started_at`**, as **3 colunas novas das conquistas** (`image_url`/`max_level`/`level_multiplier`), as tabelas **`achievements`**/**`dependent_achievements`** e a tabela **`dependent_stats` + migração `COMPLETED_TASKS→TASKS_APPROVED`** e a tabela **`dependent_punishments`** (castigo do dependente) — **todos já foram aplicados** no Supabase pelo usuário. Os blocos de SQL abaixo são **registro histórico** do que foi rodado — o mesmo vale para as seções "Próxima etapa" / "Pontos de atenção" mais antigas. **Nada está pendente no banco.**

## Decaimento de pontos — o relógio reinicia na edição, não em adiamentos (concluída — SQL aplicado no banco)

### O que foi implementado
- **O ponto de partida do decaimento deixou de ser a criação e passou a ser dinâmico:** o relógio agora começa no `decay_started_at` da tarefa — definido na **criação** e atualizado para o **momento de cada edição** (`updateTask`). ~~**Adiamentos NÃO reiniciam o relógio:** aprovar adiamento (`resolveTaskExtension`), o auto-aceite via edição de `due_date` de tarefa com pedido pendente e a reversão de uma `NOT_DELIVERED` via prazo são situações de adiamento e não afetam o decaimento.~~ **Superado pela seção no topo do documento (2026):** o adiamento **aceito** abre um novo ciclo a partir do valor **corrente** (ver "Adiamento aceito nunca devolve os pts originais" no topo), e a reabertura de `NOT_DELIVERED` zera a base — pelo que o relógio deixou de ter exceção no `updateTask` e agora **toda** edição o reinicia.
- **`restoreTask` reinicia o relógio:** a tarefa aprovada restaurada nasce com o `decay_started_at` = momento do restauro (novo ciclo, pontos cheios na base).
- **Nova coluna `tasks.decay_started_at timestamptz` (nullable):** tarefas antigas (coluna vazia) caem no fallback `created_at` até a primeira edição/restauro — comportamento antigo preservado. **Coluna já aplicada no banco (registro abaixo).**
- **Aplicações:** `getTaskDecayStart(createdAt, decayStartedAt)` (`src/utils/task-decay.ts`) resolve o start (`decay_started_at ?? created_at`); crédito (`approveTask`/`adminCompleteTask`), débito (`markTaskNotDelivered`), o aceite do adiamento (`resolveTaskExtension`/`updateTask`) e a exibição nos cards ADMIN/dependente passam a usar o start resolvido. `tasks.points` (base) deixa de ser intocada **no aceite do adiamento** — ali ela passa a ser o valor corrente (seção nova no topo).
- `getTaskCurrentPoints` teve o parâmetro `createdAt` renomeado/documented como **startAt** (ponto de partida do relógio).

### SQL aplicado no Supabase (registro — aplicado pelo usuário com sucesso)
```sql
-- Relógio do decaimento por tarefa: null = usa created_at (tarefas antigas).
alter table public.tasks add column if not exists decay_started_at timestamptz;
```

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npm run typecheck` ✓ · `npm run build` ✓ (13 rotas, `ƒ Proxy` ativo).

### Pontos de atenção
- **A coluna já está no banco** — tarefas novas nascem com o relógio em `decay_started_at`; tarefas antigas caem no fallback `created_at` até a primeira edição/restauro (comportamento documentado).
- ~~**Limite conhecido (aceito):** trocar as settings de decaimento **entre** o débito e a devolução de uma `NOT_DELIVERED` faz a devolução recalcular pelo setting novo (não pelo valor debitado em si) — correção exigiria guardar o valor debitado numa coluna (fora de escopo).~~ **Superado:** não existe mais devolução — a reabertura de uma `NOT_DELIVERED` zera a base em 0 (penalidade definitiva), então não há mais nada que recalcular.

---

## Tarefas perdem pontos com o tempo — decaimento configurável (concluída — sem mudança de schema)

### O que foi implementado
- **Nova mecânica de "decrescimento" de pontos de tarefas:** a cada **`periodHours` completas desde a criação** (default **24h**), a tarefa perde **`pointsPerPeriod`** pontos (default **1 pt**), com **piso em 0** (nunca fica negativo por essa mecânica). A janela de perda é **capada no `due_date`** — depois que o prazo vence a perda não cresce mais; uma tarefa com menos de um período até o vencimento não perde nada. `tasks.points` continua guardando o **valor-base** intocado; o valor corrente é **calculado em runtime** por `getTaskCurrentPoints` (`src/utils/task-decay.ts`).
- **Onde o valor corrente é aplicado:** o **crédito da aprovação** (`approveTask` e `adminCompleteTask`) e o **débito de "não entregue"** (`markTaskNotDelivered`) usam o valor corrente no momento da ação. ~~As **devoluções** de uma tarefa `NOT_DELIVERED` (`resolveTaskExtension` aprovado e `updateTask` alterando o prazo) restauram o **mesmo valor decrescido** debitado~~ **Superado:** a reabertura de uma `NOT_DELIVERED` **não devolve nada** — zera `tasks.points` (penalidade definitiva, ADR-0007/0018); e o adiamento aceito de uma tarefa **aberta** materializa o valor corrente como nova base (seção no topo do documento).
- **Configurável pelo ADMIN:** novo card **Decaimento de pontos** (`Hourglass`) em `/dashboard/admin/settings` — toggle liga/desliga + **Período** (horas, inteiro 1–8760) + **Pontos por período** (inteiro 1–1000). Chave `task_decay` em `HouseSettingsKey`, defaults em `DEFAULT_TASK_DECAY` (`enabled: true`, `periodHours: 24`, `pointsPerPeriod: 1`); leitura por `getHouseTaskDecaySettings` (getter cached em `src/utils/house-settings.ts`); validação fail-closed `validateTaskDecay` em `src/actions/settings.ts` (+ revalidação de `/tasks`).
- **UI:** o pill de pontos nos cards exibe o **valor corrente** e, quando decrescido, o valor-base ao lado em **line-through** (pendentes e concluídos de ADMIN e dependente; "aprovadas" seguem mostrando o valor-base, histórico). Avisos de `NOT_DELIVERED` usam o valor debitado real.

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npm run typecheck` ✓ · `npm run build` ✓ (13 rotas, `ƒ Proxy` ativo).

### Pontos de atenção
- **Sem mudança de schema/no banco:** a chave `task_decay` é só mais um valor jsonb em `house_settings`; linhas ausentes caem no default.
- **Default `enabled: true`:** logo após o deploy, todas as casas passam a ter o decaimento ativo (24h/1pt) — tarefas abertas criadas há mais de 24h já exibem o valor reduzido. O ADMIN pode desligar no menu.
- ~~**Limite conhecido (aceito):** trocar as settings de decaimento **entre** o débito e a devolução de uma `NOT_DELIVERED` faz a devolução recalcular pelo setting novo (não pelo valor debitado em si) — a janela capada no prazo mantém a divergência pequena/nula no caso comum; corrigir exigiria guardar o valor debitado numa coluna (fora de escopo).~~ **Superado:** não existe mais devolução — a reabertura de uma `NOT_DELIVERED` **não devolve nada** — zera `tasks.points` (penalidade definitiva, ADR-0007/0018), então não há mais nada que recalcular.
- **Não requer deploy urgente,** mas só vale online depois de subir.

---

## UI não fixava mudanças e "piscava" de volta ao dado antigo — service worker cacheava payloads RSC (corrigido)

### O que foi encontrado e corrigido
- **Sintoma:** após o usuário alterar algo no app (servidor action já tinha gravado no banco, confirmado na linha), a UI demorava para fixar a nova informação; em outros momentos um F5 mostrava o novo dado e, logo depois, a tela "piscava" de volta ao valor antigo. Mais frequente com o app fechado/reaberto.
- **Causa raiz (`public/sw.js`):** o handler `fetch` aplicava **cache-first para todo GET same-origin** que não fosse navegação (`mode/destination`) nem `/api/`/`/auth/`. Isso incluía os **payloads RSC das páginas** — o `router.refresh()` pós-ação e o prefetch/navegação client-side do Next buscam `/tasks`, `/rewards` etc. como GET com header `RSC:1`, que passavam pelo SW. A resposta 200 era gravada no `caches` e **reentregue para sempre**, mesmo com o banco já diferente.
  - **F5 mostra novo e "pisca" para o antigo:** F5 é navegação → vai à rede (dado novo). Ao hidratar, `router.refresh()`/Realtime disparam GETs RSC → SW responde com o **RSC obsoleto do cache** → a UI reverte ao valor antigo.
  - **Demora para "fixar":** o dado só aparece quando um refresh vence o cache (ou o Realtime entrega o evento e outro refresh passa).
  - **Pior com o app fechado:** o Cache Storage persiste entre sessões; ao reabrir, os primeiros refreshes vêm do cache velho. Risco já anotado no changelog do SW antigo (a evolução prevista era restringir o cache-first a `STATIC_ASSETS` explícitos).
- **Fix (`public/sw.js`):** cache-first restrito a **assets estáveis e imutáveis** — `STATIC_ASSETS` (manifest + ícones) e os chunks de build sob `/_next/static/` (JS/CSS nomedos por hash). **Qualquer outro GET same-origin passa direto à rede, sem cache** — incluindo payloads RSC das páginas. O `CACHE_NAME` foi bumpeado para **`casasync-v3`**, fazendo o `activate` apagar os caches antigos (que já continham RSC obsoletos).

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npm run typecheck` ✓ · `npm run build` ✓ (rotas idênticas, `ƒ Proxy` ativo).

### Pontos de atenção
- **Requer deploy** para valer online. Após subir, usuários antigos recebem o `sw.js` novo automaticamente (bump do `CACHE_NAME` força reinstalação e o `activate` limpa o cache velho); uma recarga extra pode ser necessária enquanto o SW não ativa.
- Comportamento esperado após o fix: mudanças gravadas no banco refletem na UI no 1º `router.refresh()` (sem esperar o Realtime), e o "piscar" de volta ao dado antigo deixa de existir.

---

## "Prazo próximo" por horas restantes, configurável pelo ADMIN (concluída — sem mudança de schema)

### O que foi implementado
- **O chip "Prazo próximo" (SLA) trocou a base de cálculo:** deixou de ser uma **fração do tempo total** da tarefa (`dueSoonRatio`, ex.: últimos 20%) e passou a ser um **limiar absoluto em horas** — `dueSoonHours` (default **4h**). A tarefa é "Prazo próximo" quando **faltam menos que N horas para o prazo**, independentemente de a tarefa ter sido criada hoje ou há uma semana para o mesmo prazo.
- **Configurável pelo ADMIN:** no card **Prazos de tarefas** (`/dashboard/admin/settings`) o campo virou **"'Prazo próximo' faltando"** (inteiro 0–8760, step 1, sufixo `h` — sempre em **hora(s)**) com hint explicando que independe da duração total; `0` desliga o aviso. Arredonda no cliente para inteiro (servidor exige inteiro). Novo nome/limite: `validateTaskSla` aceita 0–8760 (fail-closed, `Number.isInteger`).
- **Simplificação do utilitário:** `getTaskSlaStatus(dueDate, now = new Date(), dueSoonHours = 4)` — o 1º parâmetro `createdAt` (usado para calcular o total) **foi removido**, junto com o cálculo de `total`/`created`. Agora: `overdue` (agora > prazo) → `dueSoon` (restante ≤ `dueSoonHours` horas) → `normal`. Assinatura atualizada nos 2 call sites (`TasksAdmin`/`TasksDependent`), que ganharam a prop **`dueSoonHours`** no lugar de `dueSoonRatio`; `/tasks` repassa de `getHouseTaskSlaSettings().dueSoonHours`.
- **Sem mudança de schema/no banco:** `house_settings.value` é jsonb — uma linha `task_sla` existente com `dueSoonRatio` vira valor **morto** (ignorado via `mergeSettings`), e o default passa a ser `dueSoonHours: 4`.

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npm run typecheck` ✓ · `npm run build` ✓ (13 rotas, `ƒ Proxy` ativo).

---

## Menu de configurações da casa (ADMIN) — economia de pontos e mensagem rápida (concluída)

### O que foi implementado
- **Nova tabela `house_settings`** (PK `house_id,key`, `value` jsonb, `updated_by`/`updated_at`) com **RLS + policy de SELECT por membro da mesma casa** (SQL aplicado abaixo). **Sem Realtime** — a propagação é via `router.refresh()` pós-ação.
- **Server Action `updateHouseSettings(key, patch)`** (`src/actions/settings.ts`): escrita **exclusiva** via service role; autorização derivada da sessão (house ativa + membresia ADMIN); valida o patch por chave (bounds em `validateRewardPricing`/`validateQuickMessage`, fail-closed) e grava um upsert `(house_id, key)`. Revalida `/dashboard/admin/settings` (+ `/tasks`, `/rewards`, `/dashboard/dependent` quando `quick_message` muda).
- **Getters cached** (`getHouseRewardPricingSettings`/`getHouseQuickMessageSettings` em `src/utils/house-settings.ts`, `React.cache` + service role): leitura por casa com fallback aos **defaults** de `src/utils/settings.ts` (`DEFAULT_REWARD_PRICING`, `DEFAULT_QUICK_MESSAGE`), em linha ausente ou campo omitido (`mergeSettings`).
- **Economia de pontos:** `approveRedemption` lê as settings da casa e só encarece com `enabled`; `nextRewardCost(currentCost, settings)` usa `noIncreaseMax`/`midMax`/`midRate`/`highRate`/`minBump` configuráveis (defaults: ≤25 não encarece; 26–200 +3%; >200 +2%; piso +1 pt). Guard anti-race e rollback preservados. Com `enabled=false`, o body da notificação volta ao texto sem o novo preço.
- **Mensagem rápida:** `sendQuickMessage` valida `maxChars` e bloqueia na capacidade `capacity`; `cleanupQuickMessages` apaga a mais antiga quando `lidas >= capacity`; o compositor usa `QuickMessageSettings` para o contador/límite de caracteres e o tamanho da imagem; a plumbagem bell→nav carrega as settings nos call sites DEPENDENT (`getHouseQuickMessageSettings(house.id)` no layout dependente, `/tasks` e `/rewards`).
- **UI:** nova rota **`/dashboard/admin/settings`** (`settings-admin.tsx`, cliente) com os cards **Economia de pontos** (toggle de aumento + faixas/taxas/piso) e **Mensagem rápida** (maxChars, maxImageMb, capacity); card **Configurações** (`SlidersHorizontal`) adicionado à Visão geral (grid passou de 3 para 4 colunas em `lg:`). Feedback inline + toast + `router.refresh()`.
- **Fase 2 (concluída) — SLA/prazos de tarefas, adiamento e retenção de notificações comuns** na mesma mecânica de `house_settings`, novas chaves em `HouseSettingsKey` (ver seção dedicada abaixo).

### SQL aplicado no Supabase
```sql
create table if not exists public.house_settings (
  house_id uuid not null references public.houses(id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (house_id, key)
);
alter table public.house_settings enable row level security;
create policy "house_settings_select_members" on public.house_settings
  for select to authenticated
  using (exists (
    select 1 from public.house_members hm
    where hm.house_id = house_settings.house_id
      and hm.profile_id = auth.uid()
  ));
```

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npm run typecheck` ✓ · `npm run build` ✓ (13 rotas, `ƒ Proxy` ativo).

---

## Fase 2 das configurações da casa — SLA/prazos, adiamento e retenção de notificações (concluída)

### O que foi implementado
Mesma mecânica da fase 1 (`house_settings` jsonb por `(house_id, key)`, escrita exclusiva por `updateHouseSettings`, leitura por getters cached, sem Realtime). **Sem mudança de schema** — as chaves novas são só mais valores jsonb na tabela existente:

- **`task_sla`** — `defaultDueDays` (default 1) e `dueSoonRatio` (default 0.2) *(o `dueSoonRatio` foi **substituído** por `dueSoonHours` — limiar absoluto em horas — ver seção '"Prazo próximo" por horas restantes' no topo; em linhas antigas o valor já gravado vira morto via `mergeSettings`)*:
  - `restoreTask` agora reinicia o prazo para **agora + `defaultDueDays` dias** (antes +1 dia fixo) e a mensagem de sucesso acusa o prazo.
  - O form de nova tarefa (`TasksAdmin`) preenche o campo de data com agora + `defaultDueDays` (inicialização, reset do form e prefill do autocomplete); `handleRestore` otimista usa o mesmo valor.
  - O chip "Prazo próximo" (SLA) passou a usar `dueSoonRatio` (frações 0..1; 0 desliga o aviso), repassado das páginas a `TasksAdmin` e `TasksDependent` — `getTaskSlaStatus` ganhou 4º parâmetro opcional (default 0.2, retrocompatível).
- **`extension_rules`** — `dayOptions: number[]` (default `[1, 3]`):
  - Os botões "Aprovar (+N dias)" no card pendente do ADMIN são renderizados a partir de `dayOptions` (de 1 a 5 opções, cada 1–90 dias).
  - `resolveTaskExtension` **rejeita dias fora da lista** (fail-closed): o servidor lê a settings da casa e valida `days ∈ dayOptions`.
- **`notification_retention`** — `readRetentionDays` (default 5):
  - `cleanupReadNotifications` passou a apagar lidas **por casa da notificação** (cada casa aplica seu próprio prazo — cobre ADMIN multi-casa) e **exclui `QUICK_MESSAGE`** (as mensagens rápidas seguem só a regra de capacidade "2 lidas → apaga a mais antiga").
- **UI (`settings-admin.tsx`):** novos cards **Prazos de tarefas** (`CalendarClock`, prazo padrão em dias + percentual do SLA) e **Notificações** (`BellRing`, retenção de lidas em dias), e o card **Adiamento de tarefas** (`Clock3`) com lista dinâmica de opções de dias (adicionar/remover, min 1/máx 5). Revalidações: `task_sla`/`extension_rules` revalidam também `/tasks`.

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npm run typecheck` ✓ · `npm run build` ✓ (13 rotas, `ƒ Proxy` ativo).

---

## Aumento automático de custo de recompensa a cada resgate aprovado (concluída — sem mudança de schema)

### O que foi implementado
- **`approveRedemption` encarece a recompensa automaticamente:** após aprovar o resgate e debitar os pontos, lê o **custo atual** da recompensa (`rewards.points_cost`, não o snapshot do resgate) e aplica a taxa da faixa:
  - **≤ 25 pts → não encarece** (fica fixo no custo atual)
  - 26–200 pts → **+3%**
  - > 200 pts → **+2%**
- **`nextRewardCost(currentCost, settings)`** (`src/actions/rewards.ts`, helper interno — sem `export` porque o arquivo é `'use server'`): aplica a taxa da faixa configurada da casa com **piso de +1 pt** quando encarece (26 pts +3% = 27; recompensa pequena não fica parada uma vez que passou dos 25). *Em `src/utils/settings.ts` virou configurável por casa — ver seção "Menu de configurações da casa" no topo.*
- **Guard anti-race:** o update usa `.eq('id', reward_id)` + `.eq('points_cost', cost_antigo)` — se duas aprovações concorrentes tentarem encarecer a mesma recompensa, a segunda não sobrescreve o aumento da primeira.
- **Rollback completo se o bump falhar:** caso o update retorne zero linhas (ou erro), o resgate volta a `PENDING` (limpa `approved_by`/`resolved_at`) e os pontos são devolvidos ao dependente — mesmo padrão do rollback do débito. Não há resgate aprovado "pela metade".
- **Notificação ao dependente menciona o novo preço:** body `"Seu resgate foi aprovado. −X pts. A recompensa agora custa Y pts."` (com fallback para a mensagem antiga se a recompensa não existir — caso corrompido).
- Catálogo se atualiza sozinho: o Realtime de `rewards` + `router.refresh()` propagam o novo custo para o ADMIN e o DEPENDENT.

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npm run typecheck` ✓ · `npm run build` ✓ (12 rotas, `ƒ Proxy` ativo).

### Decisões
- O percentual aplica sobre o **custo atual da recompensa no momento da aprovação** (não sobre o preço pedido no resgate) — resgates pendentes antigos continuam válidos pelo preço que o dependente solicitou.
- Sem notificação/evento específico para o aumento em si: o novo preço entra na notificação de aprovação (é o canal que o dependente já recebe nesse fluxo).

---

## Busca de recompensas no catálogo (concluída — sem mudança de schema)

### O que foi implementado
- **Busca client-side sobre o catálogo de recompensas** em `/rewards`, tanto para ADMIN quanto para DEPENDENT: o termo digitado casa com **trechos do título e da descrição** (case-insensitive; descrição vazia é ignorada). Sem filtros extras — apenas busca simples e compacta.
- **ADMIN (`rewards-admin.tsx`):** o input de busca fica **logo abaixo do card de criação de recompensas** (agora o card de criação e a busca vivem numa `flex flex-col gap-4` na primeira coluna do grid; o catálogo segue na segunda coluna). Filtra apenas a listagem do **Catálogo** (não as sugestões nem as solicitações de resgate).
- **DEPENDENT (`rewards-dependent.tsx`):** o input de busca fica **logo abaixo do título "Loja de recompensas"** (antes do formulário de sugestão), filtrando apenas a grade da loja — resgates e sugestões não são afetados.
- **Estado vazio da busca:** quando há recompensas mas nenhuma casa com o termo, exibe `"Nenhuma recompensa encontrada para \"{termo}\"."` (`role="status"`) em vez do EmptyState de catálogo vazio; se não há recompensas nenhuma, mantém o EmptyState original.
- **Filtro derivado por `useMemo`:** cada componente ganhou estado `search` e `filteredRewards = useMemo(...)`, recomputando sobre o estado vivo de `rewards` — a busca permanece válida quando recompensas chegam/somem via Realtime ou `router.refresh()`.

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npm run typecheck` ✓ · `npm run build` ✓ (12 rotas, `ƒ Proxy` ativo).

---

## Prevenção de duplicação de tarefas pelo ADMIN (concluída — sem mudança de schema)

### O que foi implementado
- **Autocomplete "Você quis dizer..." no form de nova tarefa (`tasks-admin.tsx`):** com o título normalizado **≥ 3 chars**, exibe um dropdown com **até 3** tarefas da casa ativa (catálogo todo, qualquer status) cujo título normalizado **contém** o digitado — cada item mostra título + chip de status + nome do pupilo. Clicar preenche o form com **todos** os dados da tarefa (título, descrição, pontos, atribuição) e **prazo = agora + 1 dia**.
- **Reativar tarefa aprovada:** se a sugestão escolhida for `APPROVED`, o modo vira **"Reativar tarefa existente"** — o submit chama `restoreTask` (preserva title/description/points/assigned_to, prazo +1 dia, limpa conclusão/adio). Para qualquer outro status, "não muda nada": só preenche os campos e o tutor edita manualmente como se tivesse aberto a tarefa.
- **Soft block por pupilo (UI):** ao detectar tarefa **ativa** (`PENDING`/`IN_PROGRESS`/`NOT_DELIVERED`) com o **mesmo nome normalizado para o mesmo `assigned_to`**, exibe aviso âmbar com **"Usar existente"** (preenche o form com a tarefa do catálogo) e **"Criar mesmo assim"** (confirma explícita). Sem essa confirmação, o `handleCreate` bloqueia o submit com aviso.
- **Guard server-side (`createTask` ganhou `options?: { force?: boolean }`):** consulta tarefas ativas do mesmo pupilo na casa e compara `normalizeTaskTitle`; duplicata encontrada sem `force: true` → `{ ok: false, code: 'DUPLICATE_TASK', taskId, error }` (rede de segurança — o cliente nunca confia na própria UI). `ActionResult` estendido com `code`/`taskId` opcionais.
- **Novo `src/utils/task-normalize.ts`** (`normalizeTaskTitle`): lowercase + remove acentos (NFD) + colapsa espaços + trim — módulo puro usado no client E no servidor.
- Campos do form de criação viraram **controlados** (título, descrição, pontos, atribuição) para viabilizar o autocomplete/soft block e o prefill.

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npm run typecheck` ✓ · `npm run build` ✓ (12 rotas, `ƒ Proxy` ativo).

---

### O que foi implementado
- **Invocações diretas de push nos fluxos pedidos**, após a criação da notificação interna em `notifications` (o banner Realtime/sino continua servido pelo insert; o push sai explicitamente da própria action):
  - `createTask` (`src/actions/tasks.ts`) → **`sendPushToUser(assigneeId, …)`** com log `[PUSH] Tarefa criada → push disparado para o dependente …`.
  - `completeTask` (`src/actions/tasks.ts`) → **`sendPushToHouseAdmins(house.id, …, user.id)`** excluindo quem agiu, com log `[PUSH] Tarefa concluída → push disparado para os ADMINs da casa …`.
  - `requestRedemption` (`src/actions/rewards.ts`) → **`sendPushToHouseAdmins(house.id, …, user.id)`**, log `[PUSH] Resgate solicitado → …`.
  - `approveRedemption` / `rejectRedemption` (`src/actions/rewards.ts`) → **`sendPushToUser(profile_id, …)`**, logs `[PUSH] Resgate aprovado/recusado → …`.
- **`notifyUser`/`notifyHouse` ganharam a opção `dispatchPush: false`** (`src/utils/notifications.ts`): quando passada, o helper grava **apenas** a linha interna e devolve o disparo de push ao chamador. Os 4 fluxos acima usam `{ dispatchPush: false }` e chamam o push explicitamente — **sem duplicar o envio** (quem antes disparava dentro do helper, agora dispara na action, o que torna a execução visível nos logs da Vercel). Todos os demais call sites seguem sem a opção (padrão = dispara), mantendo o comportamento anterior.
- **Payload único compartilhado:** novo `toPushPayload(input)` em `src/utils/notifications.ts` monta o objeto de push (título/body/icon/badge/tag/data com `url`/actions) a partir do mesmo `NotifyInput` usado no insert — `notifyUser`/`notifyHouse` e as invocações explícitas nas actions usam a mesma fonte, sem divergência.
- **Erros de push não somem em silêncio:** `notifyUser`/`notifyHouse` agora logam `console.error('[PUSH] Erro ao disparar push …')` no catch (antes o bloco engolia tudo), e as chamadas explícitas nas actions também têm `try/catch` com `console.error` — se o push falhar, o motivo fica nos logs.

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npm run typecheck` ✓ · `npm run build` ✓ (12 rotas, `ƒ Proxy` ativo).

### Pontos de atenção
- **Requer deploy** para valer na Vercel. Depois de subir, reproduzir um dos 4 fluxos (criar tarefa, concluir tarefa, solicitar ou aprovar/rejeitar resgate) e conferir no runtime os logs `[PUSH] …→ push disparado …` seguidos de `[PUSH SUCCESS]`/`[PUSH ERROR]` do serviço (validação de VAPID continua em `src/lib/push-service.ts`).

### Resolução (deploy com os logs ativos)
- **Causa raiz encontrada via log:** com os `[PUSH]` logs em produção, viu-se que o disparo acontecia mas **uma das chaves VAPID estava corrompida** (`NEXT_PUBLIC_VAPID_PUBLIC_KEY` ou `VAPID_PRIVATE_KEY` — par inconsistente), então o servidor de push retornava erro de assinatura e nada chegava ao dispositivo. **Resolvido:** as chaves foram regeneradas em par e atualizadas no `.env.local` **e** nas variáveis de ambiente da Vercel. A partir daí o push real passou a chegar (logs `[PUSH SUCCESS]`). Nenhuma mudança de código adicional foi necessária — os `[PUSH]` logs é que tornaram o diagnóstico possivel.

---

## Fila de resgates do ADMIN atualizada via notificação Realtime (concluída)

- A página `/rewards` passou a assinar `REDEMPTION_REQUESTED` para o ADMIN e chamar `router.refresh()` quando a notificação chega.
- A chave do `RewardsAdmin` inclui os ids/status dos resgates recebidos pelo servidor, garantindo remontagem do Client Component após o refresh e evitando preservar a lista inicial em estado React.
- A assinatura direta de `reward_redemptions` foi preservada; a notificação funciona como fallback quando a publicação ou RLS dessa tabela não entrega o `INSERT` diretamente ao navegador.

### Verificação
`npm run lint` (somente warnings esperados de `<img>`) ✓ · `npm run typecheck` ✓ · `npm run build` ✓.

---

## Backend de push centralizado — validação de VAPID + envio multi-dispositivo (concluído, sem mudança de schema)

### O que foi implementado
- **Novo `src/lib/push-service.ts`** (server-only) com a lógica central de entrega de Web Push:
  - **`initWebPush()`** valida as env vars **`NEXT_PUBLIC_VAPID_PUBLIC_KEY`**, **`VAPID_PRIVATE_KEY`** e **`VAPID_SUBJECT`** (nova, ex.: `mailto:admin@casasync.app`) e loga **claramente** no console quando faltar alguma (chaves ausentes → push desabilitado, sem falhar silenciosamente; `VAPID_SUBJECT` ausente → usa fallback `mailto:casasync@example.com` com warning). Antes, o subject era `mailto:casasync@example.com` **hardcoded** em `src/actions/push.ts`.
  - **`sendPushNotification(targetUserId, payload)`** consulta **todas** as subscriptions do usuário (`.select('id, endpoint, p256dh, auth').eq('user_id', targetUserId)`, uma row por dispositivo) e envia com **`Promise.allSettled()`** — um dispositivo com erro NÃO derruba/rejeita os demais. Endpoints **404 e 410** (subscription morta/revogada/expirada) são **removidos automaticamente da tabela** (`delete().eq('id', ...)`), agora por `id` (antes só 410 por `endpoint`).
- **`src/actions/push.ts` delegou ao serviço:** `sendPushToUser` virou wrapper de `sendPushNotification`; `sendPushToHouseAdmins`/`sendPushToHouseDependents` seguiram intactos na API (continuam somando `sent`/`failed` por membro). Registro (`registerPushSubscription`, delete+insert) e unregister ficaram inalterados. Nenhum import externo mudou (`src/utils/notifications.ts` segue chamando as mesmas actions).
- **Integração já existia e foi preservada:** `notifyUser`/`notifyHouse` (`src/utils/notifications.ts`) inserem em `notifications` e **então** chamam o push no mesmo fluxo — cobrindo os cenários pedidos: criação/atribuição de tarefa (ADMIN→DEPENDENT), conclusão/pendente de aprovação (DEPENDENT→ADMINs), solicitação/aprovação de recompensa e sugestão, além do pedido de extensão de prazo (SLA). Sem duplicidade: a chamada já é única, logo após o insert.
- **`.env.local`** ganhou `VAPID_SUBJECT=mailto:admin@casasync.app`.

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npm run typecheck` ✓ · `npm run build` ✓.

### Pontos de atenção
- **Requer deploy** para valer online; a env `VAPID_SUBJECT` precisa existir também na Vercel (Project Settings → Environment Variables).
- Com o log `[push] ...` no `initWebPush`/`sendPushNotification`, dá para confirmar no runtime da Vercel se as chaves estão configuradas e quantos dispositivos receberam (uso de `Promise.allSettled` impede que uma subscription morta contamine as demais).

---

## Log explícito e isolamento de erros por subscription no envio (concluído, sem mudança de schema)

### O que foi implementado (dentro de `sendPushNotification` em `src/lib/push-service.ts`)
- **Isolamento por subscription:** o envio de cada dispositivo roda num mapeado dentro de `Promise.allSettled` — um token com erro (ex.: única subscription Android com problema) **não interrompe** os demais dispositivos do mesmo usuário nem rejeita o grupo, e o resumo final (`sent`/`failed` de `N` dispositivos) é logado.
- **Log explícito por envio (para depurar a Vercel):**
  - `[PUSH SUCCESS] User <id> | Status: <httpStatus> | Endpoint: <url.slice(0,30)>...` — o status de sucesso vem do `SendResult.statusCode` do `web-push`.
  - `[PUSH ERROR] User <id> | Endpoint: <url...> | Status: <statusCode> | Message: <message>` — com o `statusCode` do `WebPushError` (é isso que revela o que o **FCM/Mozilla retorna para o Android**: 201 sucesso, 400/401 falha de VAPID, 404/410 subscription morta, 403 etc.).
  - `[PUSH CLEANUP] Removida assinatura expirada id: <id>` — quando o erro é **404 ou 410** a linha é deletada por `id` (e um erro de deleção também é logado).
- **Payload JSON garantido:** novo `buildPayloadString()` normaliza o objeto para a string enviada, assegurando os campos obrigatórios **`title`, `body` e `url`** (o `url` de destino é resolvido do campo top-level ou de `data.url`, retrocompatível com `notifyUser`/`notifyHouse`), além de `icon`, `badge`, `tag`, `data` e `actions` com defaults.

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npm run typecheck` ✓ · `npm run build` ✓.

### Pontos de atenção
- **Requer deploy.** Depois de subir, reproduzir um fluxo que gera push (ex.: concluir tarefa no Android) e conferir no runtime da Vercel os logs `[PUSH SUCCESS]`/`[PUSH ERROR]` — o `Status` informado é o código HTTP do servidor de push.

---

## Push real não chegava no Android — permissão pedida fora de gesto (corrigido)

### O que foi encontrado e corrigido
- **Sintoma:** o push de teste do DevTools chegava no Android, mas o push real do servidor (gerado pelo app no navegador/PWA) nunca chegava — só a notificação interna (sino/toast via Realtime). No desktop funcionava.
- **Causa raiz:** no Android, `Notification.requestPermission()` chamado **fora de um gesto do usuário** (no mount, em `usePushNotifications`) é **auto-negado em silêncio**. Aí o `PushPermissionPrompt` escondia (`permission !== 'default'` → `null`), nunca mais dava chance de ativar, e a **subscription nunca era criada** — logo o servidor não tinha destinatário. No desktop o Chrome permite o pedido fora de gesto, por isso funcionava. O teste do DevTools não prova delivery real (atira direto no SW, sem passar por FCM/subscription).
- **Fix:** o pedido de permissão saiu do mount e virou **`enablePush()`** (`src/hooks/use-push-notifications.ts`), chamado no clique do botão "Ativar" do `PushPermissionPrompt` (gesto real do usuário); após `granted`, cria a subscription e a registra ali mesmo, e só então fecha o modal. No mount, o setup roda apenas se a permissão **já** estava `granted`.
- **Diagnóstico:** `sendPushToUser` agora loga `[push] ... nenhuma subscription registrada para o usuário <id>` quando não há destinatário — o caso que antes sumia em silêncio.

### Arquivos alterados
- `src/hooks/use-push-notifications.ts` — sem `requestPermission` no mount; novo `enablePush()` (pede + assina + registra).
- `src/components/notifications/push-permission-prompt.tsx` — botão chama `enablePush()` com estado "Ativando...".
- `src/actions/push.ts` — warn quando um usuário alvo não tem subscription.

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npm run typecheck` ✓ · `npm run build` ✓.

### Pontos de atenção
- **Requer deploy.** Depois de subir, no Android que já tinha sido "negado" pelo comportamento antigo: limpar os dados/permissão do site (em Configurações do site do navegador ou `chrome://settings/content/notifications`), reabrir o app e tocar "Ativar" no prompt.

---

## Handler de push do SW deixava de exibir notificação com payload não-JSON (corrigido)

### O que foi encontrado e corrigido
- **Sintoma:** no Android, pushes de teste/estranhos não exibiam notificação nativa; no console do SW aparecia `Push event error: SyntaxError: Failed to execute 'json' on 'PushMessageData'` — o handler de `push` chamava `event.data.json()` sem proteção e o `catch` engolia o erro, abortando o `showNotification`. O push de teste do DevTools envia **texto cru** ("Teste a me..."), não JSON; em produção o servidor sempre envia JSON, mas qualquer payload vazio/estranho matava a exibição em silêncio (clássico em Android).
- **Fix (`public/sw.js`):** handler blindado — sem payload, exibe notificação genérica ("Nova notificação recebida."); com payload não-JSON, usa `event.data.text()` como corpo em vez de abortar. `event.waitUntil(showNotification(...))` sempre executado.

### Arquivos alterados
- `public/sw.js` — handler `push` resiliente a payload nulo/não-JSON.

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npm run typecheck` ✓ · `npm run build` ✓.

---

## Push no Android não chegava — subscription nunca era registrada (corrigido, sem mudança de schema)

### O que foi encontrado e corrigido
- **Sintoma:** notificações push não chegavam no Android mesmo com a permissão concedida ao app.
- **Causa raiz:** `registerPushSubscription` (`src/actions/push.ts`) usava `upsert({...}, { onConflict: 'user_id,endpoint' })`, mas a tabela `push_subscriptions` **não tem constraint única em `(user_id, endpoint)`** no schema aplicado (`docs/sql/push_subscriptions.sql` só cria índices, não unique). Sem a constraint, o Postgres rejeita o `ON CONFLICT (user_id, endpoint)` ("no unique or exclusion constraint matching") e a subscription **nunca era gravada** — o push era "enviado" mas não havia destinatário registrado. Como o registro é best-effort (só um `console.warn` no hook), o problema passava em silêncio e afetava qualquer dispositivo, não só o Android.
- **Fix:** trocado o `upsert` por **delete + insert** (remove qualquer linha antiga do mesmo endpoint antes de gravar a nova) — não depende mais de constraint única, funciona no schema atual. O erro real do insert agora é logado (`console.error`) em vez de engolir.

### Arquivos alterados
- `src/actions/push.ts` — `registerPushSubscription` sem `onConflict`; delete por `user_id`+`endpoint` antes do insert.

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npm run typecheck` ✓ · `npm run build` ✓.

### Pontos de atenção
- **Requer deploy** para a correção valer online; após subir, refazer a subscription no dispositivo (o hook re-registra ao abrir o app com permissão `granted`; em testes, revogar/recarregar ajuda).
- Opcional (higiene): adicionar `create unique index if not exists push_subscriptions_user_endpoint_key on public.push_subscriptions (user_id, endpoint);` — não é exigido pelo código novo, apenas evita duplicidade.

---

## Instalação PWA falhava em navegadores móveis Chromium (corrigido — proxy libera assets do PWA)

### O que foi encontrado e corrigido
- **Sintoma:** o PWA instalava no Edge desktop e no Firefox mobile, mas **não** no Edge/Chrome mobile (sem a opção "Instalar app", só "Adicionar à tela inicial" = atalho).
- **Causa raiz (medido em produção, sem sessão):** o proxy redirecionava para `/login` — além de `/` — também `/manifest.webmanifest` e `/sw.js` (ambos **307**). O matcher de `src/proxy.ts` excluía do proxy apenas `_next/static`, `_next/image`, `favicon.ico` e imagens (`svg|png|jpg|jpeg|gif|webp`) — **não excluía `.js`/`.json`/`.webmanifest`**, e esses paths também não estavam em `PUBLIC_PATHS` do middleware. Efeito: na primeira visita (deslogada) o navegador baixava "HTML de login" onde esperava o JSON do manifest e o JS do service worker → **manifest inválido + SW não registra → a engine de instalação do Chromium (que exige manifest + SW) falhava** no celular. Firefox mobile instala porque é mais permissivo (não exige nem o SW); Edge desktop "funcionava" porque a verificação ocorria numa sessão já autenticada (o proxy deixa passar autenticado).
- **Fix (`src/proxy.ts`):** ampliado o matcher para também excluir `js|json|webmanifest` — `/sw.js` e `/manifest.webmanifest` agora são servidos como assets públicos, íntegros, independente de sessão (os ícones já passavam por serem `png`). Sem mudança de schema.

### Arquivos alterados
- `src/proxy.ts` — matcher exclui `.*\.(?:svg|png|jpg|jpeg|gif|webp|js|json|webmanifest)$`.

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npm run typecheck` ✓ · `npm run build` ✓ (`ƒ Proxy` ativo, rotas `○ /manifest.webmanifest` e assets estáticos inalterados).

### Pontos de atenção
- **Requer deploy:** a correção só vale online após subir para a Vercel; testar a instalação no Edge/Chrome do celular na URL de produção (a primeira visita pode abrir em `/login` — é o cenário que o fix cobre).
- Persiste como melhoria (não bloqueia) o `icon-512-maskable.png` ser byte-idêntico ao `icon-512.png` (sem margem segura — renderização do ícone na home screen pode sofrer crop).

---

## Auditoria do sistema de notificações — inconsistências corrigidas (sem mudança de schema)

### O que foi encontrado e corrigido
- **Mensagem rápida não disparava Web Push:** `sendQuickMessage` inseria as cópias em `notifications` mas não avisava os ADMINs quando o app estava fechado (todos os outros 16 tipos passavam pelo push via `notifyUser`/`notifyHouse`). Agora, após o insert, envia push aos ADMINs da casa (**best-effort**, quem agiu excluído) com `tag: casasync-quick_message` e `url: '/'`.
- **Push de `notifyHouse` ignorava `excludeUserId`:** o banco excluía o ator dos inserts, mas `sendPushToHouseAdmins`/`sendPushToHouseDependents` enviavam a **todos** os membros do lado. As duas actions de push ganharam o parâmetro opcional `excludeUserId?` e `notifyHouse` repassa o ator — alinhado ao comentário "Quem agiu é sempre excluído".
- **Capacidade de mensagem rápida fora da documentação:** o guard era `accumulated >= QUICK_MESSAGE_CAPACITY + 1` (bloqueava só na 3ª, permitindo 3 acumuladas), enquanto a regra documentada é **no máx. 2**. Corrigido para `>= QUICK_MESSAGE_CAPACITY` (bloqueia a partir da 2ª acumulada — 0 ou 1 pendentes permitem enviar).
- **Validação de imagem de mensagem rápida fraca no servidor:** só conferia o prefixo do bucket; aceitava qualquer URL pública de `casasync-media` (ex.: avatares/houses). Agora exige a pasta **`messages/`** na URL (a compositor faz `uploadMedia('messages', ...)`), alinhado à defesa documentada.

### Documentação sincronizada
- `AGENTS.md`, `PROJECT_STATUS.md` (seção "Mensagem rápida…") e `.opencode/command/context.md` divergiam do código em pontos da mensagem rápida: diziam `≤ 50` caracteres (o código é `≤ 100` — `QUICK_MESSAGE_MAX_CHARS`) e "não tiver mais de 2" acumuladas (a regra efetiva é "menos de 2"). Atualizados junto com a menção ao push.

### Arquivos alterados
- `src/actions/notifications.ts` — import de `sendPushToHouseAdmins`, guard de capacidade, validação da pasta `messages/` e push pós-insert.
- `src/actions/push.ts` — `excludeUserId?` em `sendPushToHouseAdmins`/`sendPushToHouseDependents`.
- `src/utils/notifications.ts` — `notifyHouse` repassa `excludeUserId` ao push.

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npm run typecheck` ✓ · `npm run build` ✓.

---

## App preso na raiz `https://casa-sync-web.vercel.app/` em alguns navegadores (corrigido — SW `public/sw.js`)

### Causa raiz
- **O service worker era cache-first para TODA requisição GET**, incluindo **navegação** (`mode: 'navigate'`), e ainda **pré-cacheiava `/` no `install`** (`cache.addAll(['/', ...])`). Quando `/` era prerenderizada como estática (antes do `force-dynamic`), o SW gravou o HTML antigo da raiz no cache (`casasync-v1`).
- Efeito: ao abrir `https://casa-sync-web.vercel.app/`, a navegação era respondida **pelo cache local sem chegar ao servidor** — o proxy (que decide o redirect por sessão/role) **nunca rodava**, então o app ficava preso na home e só saía com troca manual de URL. **Só "alguns navegadores"** (os que instalaram o SW com a raiz estática) sofriam; como o `CACHE_NAME` nunca mudava, o browser não reinstalava o SW e o cache velho persistia para sempre.
- Bônus: `cache.addAll(['/'])` também quebrava o `install` (rejeição em respostas não-2xx — hoje `/` é dinâmica e devolve 307), o que impedia o SW de ativar de forma confiável nos navegadores novos.

### O que foi feito (`public/sw.js`)
- **Navegação sai do cache-first:** no handler `fetch`, requisições com `request.mode === 'navigate'` **ou** `request.destination === 'document'` retornam sem `respondWith` → sempre vão à rede, o proxy roda e o redirect por sessão/role acontece. Cache-first ficou restrito a assets (manifest/ícones/etc.).
- **`/` removido do `STATIC_ASSETS` do `install`:** a raiz é 100% dinâmica, não é asset estático — evita o redirecionamento/307 e a gravação de HTML da home no cache.
- **`CACHE_NAME` → `casasync-v2`:** a mudança de bytes do `sw.js` + bump de versão forçam reinstalação nos browsers afetados; o `activate` apaga o cache `casasync-v1` com o HTML velho preso.

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npm run typecheck` ✓ · `npm run build` ✓ (12 workers, `ƒ /` dinâmica, `ƒ Proxy (Middleware)` ativo).

### Pontos de atenção / próximos passos
- Usuários com o SW antigo preso podem precisar de uma recarga extra (ou uma recarga com o DevTools aberto) enquanto o `sw.js` novo não chega — o deploy do novo arquivo dispara o update automaticamente.
- O cache-first mantido ainda grava respostas 200 de qualquer GET same-origin (ex.: payloads RSC) — se aparecerem problemas de staleness pós-deploy, a evolução é restringir o cache-first a somente `STATIC_ASSETS` explícitos.

---

## Ícone do app — otimizado, sem master no repo (Frontend, sem mudança de schema)

### O que foi feito
- **Master (4267×4267 @ 300dpi) removido do repo** (decisão: reduzir tamanho do versionamento e do app). Os ícones finais vivem em **`public/icons/`**: `icon-32.png` (~1,1 KB), `icon-192.png` (~13 KB) e `icon-512.png` (~64 KB) — redimensionamento System.Drawing (HighQualityBicubic), 32bpp ARGB. Guarde o master de 300dpi fora do repo se quiser regenerar versões futuras.
- **`<head>` sem duplicatas:** só `metadata.icons` em `src/app/layout.tsx` — `icon-32` (favicon leve) e `icon-512` (não há file convention, então a rota `○ /icon.png` deixou de existir). `metadata.manifest: '/manifest.webmanifest'` + `viewport.themeColor: '#1d4ed8'` (na metadata virou **deprecated na Next 16** — warning do build mandou mover para `viewport`).
- **`src/app/apple-icon.png` (180×180)** → file convention gera `<link rel="apple-touch-icon">` automático (home screen no iOS).
- **`src/app/manifest.ts`** (file convention → rota estática `○ /manifest.webmanifest`): `name`/`short_name`/`description`, `start_url: '/'`, `display: 'standalone'`, `background_color: '#2563eb'`, `theme_color: '#1d4ed8'`, `icons` 192/512 (`purpose: 'any'`) + 512 `maskable` — apontando para `/icons/*`.
- **Para trocar o ícone no futuro:** regenere `public/icons/` (32/192/512) e `src/app/apple-icon.png` (180) a partir do novo master — os `sizes` saem dos próprios arquivos, rotas estáticas recalculadas no build.

### Verificação
`npm run build` ✓ (rotas estáticas `○ /apple-icon.png` e `○ /manifest.webmanifest`; sem `/icon.png`) · `npm run lint` ✓ (só warnings `no-img-element` esperados) · `npm run typecheck` ✓.

## PWA / WebAPK — suporte completo à instalação (concluída)

### O que foi implementado
- **Manifesto (`src/app/manifest.ts`)** atualizado com todos os campos obrigatórios para instalabilidade: `name`, `short_name`, `description`, `start_url: '/'`, `scope: '/'`, `display: 'standalone'`, `orientation: 'portrait'`, `background_color: '#2563eb'`, `theme_color: '#1d4ed8'`. Ícones declarados com `purpose: 'any'` (192 e 512) e `purpose: 'maskable'` (512) — atende critérios do WebAPK Android.
- **Meta tags e Viewport (`src/app/layout.tsx`)**: exportados `viewport` (themeColor, width, initialScale, maximumScale) e `metadata` com `manifest: '/manifest.webmanifest'`, `appleWebApp` (`capable: true`, `statusBarStyle: 'default'`, `title: 'CasaSync'`), `icons.apple: '/apple-icon.png'` — suporte completo a iOS/Safari "Add to Home Screen".
- **Service Worker (`public/sw.js`)** básico criado e registrado via Client Component (`src/components/pwa/service-worker-registration.tsx`) no `RootLayout`: cache estático dos assets essenciais (`/`, manifesto, ícones), `skipWaiting`/`clients.claim` para atualização ativa, estratégia *cache-first* para navegação e assets estáticos (ignora chamadas de API `/api/`, `/auth/`). Garante o critério "service worker registrado com fetch handler" para instalação WebAPK no Chrome/Edge Android.
- **Ícones verificados**: `/icons/icon-32.png`, `/icons/icon-192.png`, `/icons/icon-512.png` em `public/icons/` (acessíveis sem redirecionamento); `/apple-icon.png` (180×180) em `src/app/` via file convention.

### Verificação
`npm run lint` ✓ · `npm run typecheck` ✓ · `npm run build` ✓ (rotas estáticas `○ /apple-icon.png`, `○ /manifest.webmanifest`, `○ /sw.js` servido como arquivo estático).

## Transições entre rotas mais ágeis (concluída — sem mudança de schema)

### Diagnóstico (lentidão era acúmulo de round-trips, não um endpoint específico)
- Todas as páginas são `dynamic = 'force-dynamic'` → cada navegação é um render dinâmico novo, sem cache.
- Cadeia serial por navegação ADMIN (`/tasks`): proxy (`getUser()` + select `profiles.user_role`) → página (`getSessionProfile` = `getUser()` + select `profiles`) → `getMyNotifications` (DELETE de limpeza lazy + SELECT) → `getActiveAdminHouse` (**chamava `getSessionProfile` de novo** + listagem de casas) → tarefas + assignees. **~12 chamadas HTTP em série** (amplificado por acesso em rede local/outro dispositivo).
- Sem `loading.tsx`/`Suspense` em nenhum segmento → durante a navegação dinâmica não havia feedback; `/tasks` e `/rewards` renderizam o próprio shell (nav/sino + canal Realtime remontando a cada transição).

### O que foi feito (conjunto "menos dramático": A1 + A3 + B6)
- **A1 — `React.cache` (memoização por request) em `src/utils/house.ts`:** `getSessionProfile` (elimina o `getUser()`+`profiles` duplicado que `getActiveAdminHouse` disparava no mesmo request; layouts e páginas do dashboard compartilham uma única chamada) e `getAdminHouses` (a consulta interna de `getActiveAdminHouse` e a da página `/dashboard/admin/houses` viram uma só). Sem mudança de assinatura.
- **A3 — `Promise.all` nas páginas:** `tasks`/`rewards` buscam notificações + casa (ativa p/ ADMIN, do dependente) em paralelo e usam referências comuns; admin de `tasks` paraleliza tarefas + assignees; `/dashboard/admin/houses` paraleliza casa ativa + casas; `/dashboard/admin` paraleliza sessão + casa ativa.
- **B6 — telas de loading amigáveis:** novo `PageSkeleton` (`src/components/ui/page-skeleton.tsx`, placeholders `animate-pulse` no visual do app — hero, header fixo opcional e grid de cards) + `loading.tsx` em `tasks/`, `rewards/`, `dashboard/admin/`, `dashboard/dependent/` e `dashboard/admin/houses/`. Feedback instantâneo na transição.

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npm run build` ✓ (rotas idênticas, `ƒ Proxy` ativo) · `npm run typecheck` ✓.

### Próximo passo (não feito — maior esforço/risco)
- Proxy `getUser()` → `getClaims()` (+ role num claim do JWT, se quisermos zerar o round-trip do proxy); layout compartilhado para o shell do dashboard (evita remount do nav/sino/Realtime entre `/*`, `/tasks` e `/rewards`); `unstable_cache`/Cache Components para navegação "instantânea" de verdade; Condição de execução da limpeza lazy de notificações (hoje roda um DELETE a cada render).

## Refresco de documentação e contexto (concluída)

### O que foi feito
- **Docs sincronizadas com o banco (nada pendente):** `AGENTS.md`, `README.md` e `docs/schema.md` deixaram de marcar `rewards.active`, `notifications.image_url`/`message_id` e o bucket/pasta `messages` como "a aplicar/pendente" — tudo **já aplicado** no Supabase (confirmado; os blocos de SQL em `PROJECT_STATUS.md` seguem como **registro histórico**). `docs/schema.md` perdeu as caixas "A aplicar" e documenta `notifications.type` como `text` **sem CHECK** no banco.
- **Removido `src/app/auth/callback/route.ts`:** sem uso desde que o login com Google foi removido (nada o referenciava; `src/app/auth/` deixou de existir).
- **Contagem de notificações corrigida:** são **17** tipos em `src/types/notifications.ts` (o `QUICK_MESSAGE` foi adicionado; antes constava 16). *Atualizado depois: com o `ACHIEVEMENT_UNLOCKED` são **18** (seção no topo).*
- **Types seguem espelho manual atualizado** (`src/types/database.ts` já contém `rewards.active` e `notifications.image_url`/`message_id`) — mantido sem regeneração via CLI.
- **Evolução futura anotada (não feita):** migrar `supabase.auth.getUser()` → `getClaims()` no `updateSession` (docs atuais do Supabase preferem `getClaims()` no proxy — validar assinatura do JWT a cada request).
- Material de ensino (skill `teach`) mantido como está.

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npx tsc --noEmit` ✓ · `npm run build` ✓ (12 workers, `ƒ Proxy` ativo).

---

## Bug de fuso em prazos de tarefas — data/hora com 3h de diferença (corrigido)

### Causa raiz (investigação)
- O `<input type="datetime-local">` produz um valor **sem fuso** (`YYYY-MM-DDTHH:mm` — hora de parede local do usuário; America/Recife = UTC-3). O formulário enviava essa string **naive** direto ao banco (`createTask`/`updateTask` → coluna `tasks.due_date`, `timestamptz`). O Postgres interpreta string sem fuso na **timezone da sessão do servidor (Supabase: UTC)** → um prazo digitado 14:30 virava o instante `14:30Z` = **11:30 em Recife** (3 horas adiantado).
- Por que "nem sempre": no salvamento de edição (`saveDueDate`) o card otimista usava `new Date(value).toISOString()` **no browser** (instante correto), mas enviava a string naive crua ao servidor — o card mostrava certo até o refresh/Realtime, aí o valor deslocado aparecia.

### O que foi feito
- **Novo helper `src/utils/datetime-local.ts`:** `datetimeLocalToIso` converte o valor naive do `datetime-local` para o **instante UTC correto no fuso do cliente** (`new Date(naive)` no browser = hora local por especificação do ECMAScript; `typeof window` trava para nunca rodar no servidor). Os formatadores que viviam em `tasks-admin.tsx` foram para lá (`isoToDateTimeLocalValue`, `nowDateTimeLocalValue`, `modifyDateTimeLocal`).
- **Cliente converte antes de enviar** (`src/components/tasks/tasks-admin.tsx`): criação (`handleCreate`) e edição de prazo (`saveDueDate`) passam por `datetimeLocalToIso`, e o otimista usa o mesmo instante — sem `new Date().toISOString()` solto no submit.
- **Guarda server-side** (`normalizeDueDate` em `src/actions/tasks.ts`): `createTask` e `updateTask` **rejeitam prazo sem fuso** (fail-closed) — uma naive que voltar a chegar vira erro visível em vez de re-gravar data errada.
- **Exibição local só no cliente:** novo `FormattedDateTime` (`src/components/ui/formatted-date.tsx`, via `useSyncExternalStore`). Nos cards sempre renderizados (dependente/rewards) um `toLocaleString('pt-BR')` no SSR (Vercel/Netlify giram em UTC) produzia hora de parede UTC no HTML e o cliente re-hidratava em hora local — hydration mismatch + flash. O componente renderiza um placeholder estável até a hidratação e então formata no fuso do dispositivo.
- **Prazos gerados pelo servidor** (`restoreTask`, `resolveTaskExtension`, auto-aceite do `updateTask`, `markTaskNotDelivered`) já usavam `.toISOString()`/instantes — corretos; não mudaram.
- **Sem mudança de schema:** `tasks.due_date` continua `timestamptz`. Sem lib nova de datas (decisão: especificação do ECMAScript + trava de ambiente cobrem o caso sem dependência).

### SQL opcional — corrigir tarefas JÁ criadas (manual, revertível, não destrói dados)
Tarefas existentes criadas/editadas pelo input carregam o instante 3h adiantado. Correção **já aplicada** (09/2026, com backup revertível — nada quebra se pular; rodar no dashboard do Supabase na ordem):
```sql
-- 1) Backup (revertível): guarda o estado atual de TODO o `due_date`.
create table if not exists tasks_due_date_backup as
  select id, due_date from tasks;

-- 2) Corrige +3h SÓ nas tarefas "digitadas" pelo usuário.
--    Datas de `datetime-local` têm precisão de minuto (segundos = 0), então
--    `due_date = date_trunc('minute', due_date)` seleciona exatamente essas;
--    prazos gerados pelo servidor (restore/adiamento) guardam segundos+
--    milissegundos e ficam intactos. Ajuste o intervalo se o fuso não for -03.
update tasks
set due_date = due_date + interval '3 hours'
where due_date is not null
  and due_date = date_trunc('minute', due_date);

-- 3) Rollback (restaura tudo como estava):
update tasks t
set due_date = b.due_date
from tasks_due_date_backup b
where t.id = b.id;
```

*O backup (`tasks_due_date_backup`) permanece no banco; com ele, o rollback continua disponível a qualquer momento. Decisão completa (contrato "todo `due_date` com fuso", SQL de reparo só faz sentido no offset de digitação) em **ADR-0013** (`docs/adr/0013-prazos-de-tarefa-com-fuso-horario.md`).*

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npx tsc --noEmit` ✓ · `npm run build` ✓ (12 workers, `ƒ Proxy` ativo).

---

## Mensagem rápida DEPENDENT → ADMIN (implementada — SQL aplicado)

### O que foi implementado
- **Compositor no sino do DEPENDENT** (`src/components/notifications/quick-message-composer.tsx`, renderizado em `notifications-bell.tsx` quando `canSend`): **colapsável** — o cabeçalho (ícone violeta + "Mensagem rápida" + chevron girando) abre/fecha o compositor, que **inicia recolhido** (`open` default `false`). Texto **opcional** de até **100 caracteres** (contador) + **1 imagem** por mensagem (até **5 MB**, só `image/*`), escolhida da **Galeria** (input `accept="image/*"`) ou da **Câmera** — câmera **ao vivo real** em qualquer dispositivo via `getUserMedia` (`facingMode: 'environment'`, fallback para a webcam e para o seletor de arquivos quando a câmera está indisponível); preview com remover; upload via `uploadMedia('messages', user.id)` (nova pasta `messages` em `casasync-media`).
- **Server Action `sendQuickMessage(text, imageUrl?)`** (`src/actions/notifications.ts`): só **DEPENDENT** (papel derivado da sessão); valida `≤ 100` caracteres, exige texto OU imagem, e que a imagem seja URL pública do bucket na pasta **`messages/`** (defesa server-side); checa **capacidade** — o dependente envia apenas enquanto tiver **menos de 2 mensagens próprias acumuladas** (lidas ou não; `QUICK_MESSAGE_CAPACITY=2`, guard `>= CAPACITY`); insere **1 cópia por ADMIN da casa** (mesmo `message_id`, título "Mensagem de {nome}", `image_url`) **+ 1 cópia para o próprio dependente** como **comprovante já lido** (título "Mensagem enviada", `read_at` preenchido — chega no sino dele como notificação **simples, sem possibilidade de edição**; não conta como não-lida nem para a retenção) e, ao final, **envia push aos ADMINs da casa** (best-effort, quem agiu excluído). Realtime entrega aos sinos dos ADMINs (e ao do próprio dependente).
- **Visualização com leitura automática:** o card da `QUICK_MESSAGE` é **colapsável** — tocar no cabeçalho expande (texto completo + imagem em tamanho real, chevron girando) e **marca como lida imediatamente**; **todos iniciam recolhidos** por padrão (`expandedQuickIds: Set<string>`); na lista o card recolhido mostra o texto e um thumbnail quando há imagem.
- **Retenção ("2 lidas → apaga a mais antiga"):** `cleanupQuickMessages` em `src/utils/notifications.ts`, disparado em `markNotificationRead` e `markAllNotificationsRead`. A mensagem é considerada **lida** quando **qualquer cópia de destinatário** (ex.: qualquer ADMIN) foi aberta — **a cópia do próprio remetente é ignorada na contagem** (é só comprovante); ao atingir **2 lidas**, apaga o grupo mais antigo (todas as cópias pelo `message_id`, incluindo a do dependente, + remoção da imagem no storage, best-effort). Conta **MENSAGENS distintas**, não cópias por destinatário (casa com 2 ADMINS = 1 mensagem).
- **Notificações comuns** (`tasks`/`rewards`/`sugestões`) ganharam passthrough de `image_url`/`message_id` em `notifyUser`/`notifyHouse` (sem uso atual) — o campo existe no banco e fica disponível para eventos futuros com imagem.

### SQL aplicado no Supabase
```sql
-- O bucket publico `casasync-media` NAO existia (upload falhava com "Bucket not
-- found" em todas as pastas). Criar + liberar select publico e insert de upload
-- para autenticados:
insert into storage.buckets (id, name, public)
values ('casasync-media', 'casasync-media', true)
on conflict (id) do update set public = true;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'casasync_media_select_public') then
    create policy "casasync_media_select_public" on storage.objects
      for select to public using (bucket_id = 'casasync-media');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'casasync_media_insert_authenticated') then
    create policy "casasync_media_insert_authenticated" on storage.objects
      for insert to authenticated with check (bucket_id = 'casasync-media');
  end if;
end $$;

-- Colunas de mensagem rapida:
alter table public.notifications add column if not exists image_url text;
alter table public.notifications add column if not exists message_id uuid;
create index if not exists notifications_message_idx on public.notifications (message_id);
-- SE existir CHECK constraint no `notifications.type`, incluir 'QUICK_MESSAGE'
-- no conjunto de valores permitidos (ou recriar a constraint com o valor novo).
```

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npx tsc --noEmit` ✓ · `npm run build` ✓ (12 workers, `ƒ Proxy` ativo).

### Decisões
- Mensagem rápida é **notificação** (destinatário = ADMINs, o "outro lado"), então reutiliza `notifications` com `type='QUICK_MESSAGE'` + `message_id` para agrupar as cópias de um mesmo envio — sem tabela nova, sem policy/Realtime novos (já na publication).
- Texto é opcional se houver imagem; `body` pode ficar vazio (o título identifica o remetente e o visualizador mostra a imagem).
- Armazenamento fiel à escolha do usuário: limite **conta mensagens** e a limpeza acontece **no ato de marcar lida** (regra "2 lidas → apaga a mais antiga"), removendo também a imagem do storage para não inflar o bucket.
- Câmera **ao vivo** (getUserMedia) no desktop e celular com fallback para seletor — atende "origem da imagem direto do dispositivo e pela câmera", independente de plataforma.

---

## Upload de imagem em TAREFAS desabilitado (concluída — sem mudança de schema)

### O que foi feito
- **UI de upload de tarefas removida (comentada):** em `src/components/tasks/tasks-admin.tsx` o `ImageUpload` do form de tarefas (import, estado `taskImageUrl`, bloco JSX e `input hidden image_url`) está **comentado** com a explicação inline — o envio foi desligado para **não inflar o storage/banco**. Sem o campo, `formData.get('image_url')` volta `null` e a tarefa nova nasce sem imagem.
- **Sem mudança no banco:** a coluna `tasks.image_url` e as actions `createTask`/`updateTask` **continuam intactas** — imagens de tarefas **antigas** seguem exibidas nos cards (ADMIN e DEPENDENT, com comentário nos pontos de exibição).
- **Reativação:** basta descomentar import/estado/bloco — nenhuma migração necessária.

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npx tsc --noEmit` ✓ · `npm run build` ✓ (12 workers, `ƒ Proxy` ativo).

---

## Desativação de recompensa pelo ADMIN (implementada — SQL `rewards.active` aplicado)

### O que foi implementado
- **Nova coluna `rewards.active`** (`boolean not null default true`): recompensa ativa por padrão; `false` = desativada (indisponível), **nunca excluída**. Só o ADMIN alterna — o dependente nunca reativa.
- **Server Action `setRewardActive(rewardId, active)`** (`src/actions/rewards.ts`): só ADMIN da casa (`assertAdminCanManage`); confirma que a recompensa pertence à casa ativa (`house_id`) antes de alternar `active`; revalida `/rewards`. Não há notificação associada (ação administrativa de gestão da loja).
- **`requestRedemption` guardado:** a consulta passa a incluir `active` e, com `active = false`, retorna `"Recompensa indisponível no momento."` — defesa no servidor, não depende só da UI.
- **UI ADMIN (`rewards-admin.tsx`):** no catálogo cada recompensa ganhou o botão **Desativar**/**Reativar** (ao lado de Editar); quando inativa, o card fica com fundo `slate-50`/borda `slate-300`, a imagem dessaturada e um chip rosa **"Inativa"**. Atualização otimista + `router.refresh()`.
- **UI DEPENDENTE (`rewards-dependent.tsx`):** recompensa desativada aparece acinzentada (borda/fundo `slate-300/50`, imagem em grayscale, título `slate-500`) com **"Indisponível"** no lugar do status de saldo; o botão "Resgatar" vira "Indisponível" e fica desabilitado. Reativação do ADMIN volta tudo ao normal automaticamente (Realtime).
- **Realtime:** `rewards` já está na publication — o cambio de `active` chega nos listeners sem alteração de publication/RLS.

### SQL aplicado no Supabase
```sql
alter table public.rewards add column if not exists active boolean not null default true;
```

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npx tsc --noEmit` ✓ · `npm run build` ✓ (12 workers, `ƒ Proxy` ativo).

### Decisões
- Desativar **não** apaga nem cancela resgates já aprovados/pendentes — afeta apenas novos pedidos (o guard bloqueia `requestRedemption`).
- Sem novo enum/status: ser ativa ou não é um atributo da recompensa, não do catálogo; a coluna tem default `true` para que as recompensas existentes nasçam ativas.

---

## Alteração de pontos de dependente pelo ADMIN via PIN_PTS (concluída)

### O que foi implementado
- **Nova env server-only `PIN_PTS`** (`.env.local`): senha exigida para o ADMIN alterar o saldo de pontos de um dependente — mesma mecânica do `MASTER_PIN` (fail closed se a env não estiver configurada).
- **Server Action `updateDependentPoints(dependentId, newPoints, pinPts)`** (`src/actions/houses.ts`): exige sessão ADMIN; valida `pinPts === process.env.PIN_PTS`, `validatePoints` (inteiro entre `POINTS_MIN = -1.000.000` e `POINTS_MAX = 1.000.000`, em `actions/types.ts`) e que o alvo é `DEPENDENT` de uma casa que o ator controla como ADMIN. Escrita em `profiles.points` via service role — **SET absoluto**, pode ser negativo. Revalida casas/tarefas/recompensas/dashboard.
- **UI (`houses-manager.tsx`):** pill âmbar **"N pts"** junto da role de cada dependente + botão **"Pontos"** (`Coins`) abre `Modal` "Alterar pontos — {nome}" com o saldo atual, input `newPoints` (number, **uncontrolled**) e o input `pinPts` (password, **uncontrolled**, `suppressHydrationWarning` — credencial nunca vai ao estado React, ADR-0003). Feedback **inline** (erro `role="alert"` / sucesso `role="status"`) + `router.refresh()` para a lista e o saldo mostrarem o novo valor (Realtime/`useProfilePoints` no lado do dependente também).

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npx tsc --noEmit` ✓ · `npm run build` ✓ (12 workers, `ƒ Proxy` ativo).

### Decisões
- VALOR = SET absoluto do acumulado (não delta) e restrito aos `DEPENDENT` da casa — pontos de ADMIN continuam sem significado na UI.
- PIN exigido porque essa é a única forma de *editar* o saldo manualmente (fora do fluxo tarefas/recompensas); sem PIN, qualquer ADMIN membro poderia pontuar à vontade.
- Detalhamento do "porquê" no **ADR-0012** (`docs/adr/0012-alteracao-de-pontos-pelo-admin-com-pin.md`).

---

## Pontos do ADMIN removidos da UI (concluída)

### O que foi implementado
- **ADMIN não acumula pontos**, então o saldo exibido para ele era ruído: o `DashboardNav` só recebe `points` no papel **DEPENDENT**. Removido `points={profile?.points}` do layout admin e, em `/tasks` e `/rewards` (role-aware), agora `points={isAdmin ? undefined : profile.points}`.
- **Efeito:** some o badge "N pts" do cabeçalho e a linha de pontos do `Modal` "Sua conta" para ADMIN; dependentes seguem iguais. O `DashboardNav` já renderiza esses blocos só quando `points` é número.
- **Nada mais alterado:** custos de recompensa, saldo do dependente e o resgate continuam como antes.

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npx tsc --noEmit` ✓ · `npm run build` ✓ (12 workers, `ƒ Proxy` ativo).

---

## "Sair" acessível em qualquer tela (concluída)

### O que foi implementado
- **Avatar do cabeçalho virou botão de conta:** em `dashboard-nav.tsx` o avatar (inicial) passou a ser um `<button>` que abre um `Modal` **"Sua conta"** (avatar + nome + pontos + `SignOutButton` em largura total). Antes, o "Sair" do cabeçalho era `hidden md:block` e o slot extra da bottom nav só existia com `items.length < 4` — logo, o **ADMIN no mobile (4 itens)** não tinha como sair.
- **Sem regressão:** o "Sair" do desktop (cabeçalho, `md:block`) e o slot extra da bottom nav (dependentes, 3 itens) continuam; a conta no avatar apenas garante a ação em **qualquer largura**.

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npx tsc --noEmit` ✓ · `npm run build` ✓ (12 workers, `ƒ Proxy` ativo).

---

## Reset de senha de membros pelo ADMIN (concluída)

### O que foi implementado
- **Server Action `updateMemberPassword(targetUserId, newPassword)`** (`src/actions/houses.ts`, junto do domínio de membros/casas): o ADMIN redefine a senha de qualquer membro de uma casa que controla — dependentes E co-ADMINs — usando `createAdminClient().auth.admin.updateUserById(...)` (service role, **sem e-mail de recuperação**).
- **Autorização derivada da sessão:** exige `user_role='ADMIN'`; busca as casas em que o ator é `house_members.role='ADMIN'` e confirma que o alvo é membro de pelo menos uma delas **antes** de agir (o `targetUserId` do cliente nunca é confiado). Action nunca lança (`try/catch` → `ActionResult`).
- **Validação:** reutiliza `validatePassword` (**>= 6**), igual ao cadastro/login.
- **UI (`houses-manager.tsx`):** botão **"Senha"** (ícone `Key`) em cada membro abre um `Modal` com input de senha **uncontrolled** (`name="newPassword"`, lido via `FormData` no submit — ADR-0003) e feedback **inline** (erro `role="alert"` / sucesso `role="status"`); a linha de membros passou a `flex-wrap` para não espremer em telas estreitas.
- **Efeito:** a senha muda imediatamente; o próximo login já usa a nova. Sessões ativas do alvo **não** são revogadas (comportamento padrão do Supabase).

### Ajuste posterior — senha de outros membros só pelo autor
- Qualquer ADMIN altera a **própria** senha; alterar a senha de **outros** membros da casa (dependentes ou co-ADMINs) ficou restrito ao **autor da casa** (`houses.owner_id`): além da membresia, a action valida que o ator é `owner_id` do `houses` do membro (novo guard dentro de `updateMemberPassword`). Co-ADMINs (que entraram via PIN) não alteram a senha de ninguém além da própria — mesmo comportamento refletido na UI, onde o botão "Senha" só aparece na própria linha ou quando o usuário é o autor da casa ativa (`houses-manager.tsx`). Sem mudança de schema.

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npx tsc --noEmit` ✓ · `npm run build` ✓ (12 workers, `ƒ Proxy` ativo).

### Decisões
- Implementado seguindo as convenções do repo (a spec original citava `src/actions/members.ts` e uma rota `/members`, que não existem): action em `houses.ts`, UI em `houses-manager.tsx`.
- Feedback inline em vez de toast (o app não tem lib de toast).
- Detalhamento do "porquê" no **ADR-0011** (`docs/adr/0011-reset-de-senha-pelo-admin.md`).

---

## Responsivo dos cards de tarefas (concluída)

### O que foi implementado
- **Nome da tarefa na linha superior, chips/botões abaixo (mobile):** nos cards de tarefas (ADMIN e DEPENDENTE) os `chips` (SLA/status), `pill` de pontos, chevron e botões de ação espremiam o título em telas estreitas. Agora o **título ocupa a linha de cima** e os elementos ficam numa **linha abaixo**, voltando ao layout lado a lado em `sm:`.
- **`tasks-admin.tsx`:** pendentes — o cabeçalho colapsável virou `flex-wrap` com o título `basis-full sm:basis-0 sm:flex-1` (chips + pontos + chevron caem para a linha seguinte no mobile); concluídas/aprovadas — o container virou `flex-col sm:flex-row`, com o título/chevron no topo e o grupo `chip + botões` (Desaprovar/Aprovar, Restaurar) abaixo.
- **`tasks-dependent.tsx`:** título e descrição vêm antes dos chips; SLA/status/pontos/prazo/adiamento foram reunidos numa única linha `flex-wrap` abaixo do texto.

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npx tsc --noEmit` ✓ · `npm run build` ✓.

---

## Notificações entre ADMIN e dependente (sino no cabeçalho) — concluída

### O que foi implementado
- **Tabela `notifications`** (1 linha por destinatário): `house_id`, `recipient_id`, `actor_id` (nullable), `type`, `title`, `body`, `link` (nullable), `read_at` (nullable; `null` = não lida), `created_at`.
- **Registro best-effort** (`src/utils/notifications.ts`): `notifyUser` (um destinatário) e `notifyHouse` (resolve todos os ADMINs ou todos os DEPENDENTEs da casa e exclui quem agiu). Falha ao gravar **nunca** derruba a ação principal (crédito/débito de pontos, aprovações etc.).
- **Destinatário = "o outro lado" da ação:** o dependente recebe tudo que os ADMINs fazem nas tarefas/resgates/sugestões dele; **todos os ADMINs membros** recebem tudo que o dependente faz. Quem agiu não recebe a própria ação.
- **Eventos cobertos:** criação/conclusão/aprovação/devolução/restauração de tarefa, `NOT_DELIVERED`, pedido e resolução de adiamento, criação de recompensa, pedido e resolução de resgate, criação e resolução de sugestão — integrados nas actions existentes de `src/actions/tasks.ts` e `src/actions/rewards.ts` (18 tipos em `src/types/notifications.ts`).
- **Gerenciamento** (`src/actions/notifications.ts`): `markNotificationRead`, `markAllNotificationsRead`, `deleteNotification`, `deleteAllNotifications`, `purgeReadNotifications` — escopo sempre `recipient_id = user.id` (derivado da sessão; service-role).
- **Retenção:** lidas apagadas após **5 dias** por limpeza lazy em `getMyNotifications` (sem `pg_cron`); `READ_RETENTION_DAYS` em `src/utils/notifications.ts`.
- **UI:** `NotificationsBell` (`src/components/notifications/notifications-bell.tsx`) no cabeçalho (`src/components/dashboard/dashboard-nav.tsx`), ao lado do avatar/pontos: badge de não lidas, painel em `Modal`, "marcar todas", "apagar todas" e apagar individual; clique marca lida e abre o `link` (`/tasks`/`/rewards`).
- **Realtime:** a tabela entra na publication `supabase_realtime`; o browser assina `recipient_id=eq.<userId>` e o RLS de SELECT (`recipient_id = auth.uid()`) garante que só as próprias notificações cheguem.
- **Dados iniciais:** carregados no servidor por `getMyNotifications(user.id)` nos layouts admin/dependent e nas páginas `/tasks` e `/rewards`, passados ao `DashboardNav` (`userId` + `notifications`).

### SQL aplicado no Supabase (registro)
```sql
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  type text not null,
  title text not null,
  body text not null,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_recipient_created_idx
  on public.notifications (recipient_id, created_at desc);

alter table public.notifications enable row level security;

create policy "notifications_select_own" on public.notifications
  for select to authenticated
  using (recipient_id = auth.uid());

alter publication supabase_realtime add table public.notifications;
```

### Bug corrigido — Realtime não chegava sem F5 (`usePostgresChanges`)

**Sintoma:** o sino/notificações só apareciam após recarregar a página. O canal retornava `SUBSCRIBED`, mas nenhum evento chegava.

**Causa raiz (confirmada empiricamente):** quando a sessão é **restaurada do storage/cookies** (caso do browser, via `@supabase/ssr`), o `auth.getSession()` é assíncrono e o socket Realtime conectava **como `anon`** antes do token estar disponível. Como o RLS da tabela usa `auth.uid()`, o evento era descartado em silêncio — sem erro, sem `CHANNEL_ERROR`. Diagnóstico: um probe com `signInWithPassword` (token já em memória) recebia os eventos; o mesmo probe com a sessão vinda do storage **não** recebia. Um segundo probe provou que `await getSession()` + `await realtime.setAuth(token)` **antes** de assinar resolve (`events:1`).

**Fix (`src/hooks/use-postgres-changes.ts`):** o efeito virou assíncrono — antes de criar/assinar o canal, faz `getSession()` e `realtime.setAuth(session.access_token)`. Como todos os listeners usam esse hook, a correção vale para **tarefas, recompensas, resgates, sugestões e notificações** (o Realtime do app estava sujeito ao mesmo problema). Cleanup continua cancelando o subscribe pendente (`cancelled`) e removendo o canal quando já criado. Ver **ADR-0010** (o "porquê" do `setAuth` — não remover).

### Ajustes de UI do painel (modal)
- **`Modal` (`src/components/ui/modal.tsx`)** passou a renderizar via **portal para o `body`** (`z-[100]`): antes ficava dentro do header azul (stacking context `z-50` + `text-white`), então herdava a cor branca (botões "invisíveis") e deixava a bottom nav clicável por trás. Agora também **trava o scroll do documento** (`body.overflow = hidden`), **prende o foco (Tab/Shift+Tab) dentro da janela** (o foco não vaza mais para header/bottom nav; restaura o foco anterior ao fechar; foca o painel ao abrir) e fecha no **Esc**. Vale para os 4 usos (sino, casas, recompensas, tarefas).
- **Sino (`notifications-bell.tsx`):** botões "Marcar todas" (azul) e "Apagar todas" (vermelho) com cores explícitas (não dependem mais de `currentColor`); botão individual de **marcar como lida** (ícone `Check`) adicionado ao lado do de apagar; itens com hover/borda e título com `truncate`.

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npx tsc --noEmit` ✓ · `npm run build` ✓ (12 workers, `ƒ Proxy` ativo) · probes de Realtime: sessão do storage `BROKEN` (0 eventos) × com `setAuth` `WORKS` (1 evento).

### Decisões
- Notificações são **efeito secundário**: registro best-effort, sem rollback da ação principal em caso de falha.
- `title`/`body` são snapshot em texto (histórico preservado mesmo se nomes/títulos mudarem depois) — evita joins e simplifica o Realtime.
- Retenção lazy (sem `pg_cron`) e leitura via service-role com escopo de sessão (ADR-0001/0006), mantendo a policy de SELECT apenas para o Realtime.
- Detalhamento do "porquê" no **ADR-0009** (`docs/adr/0009-notificacoes-entre-admin-e-dependente.md`) e, para o Realtime, no **ADR-0010** (`docs/adr/0010-realtime-exige-setAuth-da-sessao.md`).

---

## Web Push Notifications (PWA) — notificações nativas no Android/Desktop (concluída)

### O que foi implementado
- **VAPID Keys** geradas e configuradas no `.env.local` (`VAPID_PRIVATE_KEY` server-only, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` client).
- **Service Worker (`public/sw.js`)** estendido com handlers `push`, `notificationclick` e `pushsubscriptionchange`: exibe notificação nativa do SO, abre/foca o app ao clicar, limpa subscriptions expiradas.
- **Tabela `push_subscriptions`** no Supabase: `endpoint`, `p256dh`, `auth`, `user_id`, `house_id`, `user_agent` — RLS por usuário + admin da casa, publication Realtime.
- **Client-side (`src/utils/push.ts`)**: `urlBase64ToUint8Array`, `subscribeToPush`, `unsubscribeFromPush`, `subscriptionToJSON`.
- **Hook `usePushNotifications`** (`src/hooks/use-push-notifications.ts`): pede permissão `Notification.requestPermission()`, subscreve via `pushManager`, registra a subscription no backend via `registerPushSubscription` action.
- **Server Actions (`src/actions/push.ts`)**: `registerPushSubscription`, `unregisterPushSubscription`, `unregisterAllPushSubscriptions`, `sendPushToUser`, `sendPushToHouseAdmins`, `sendPushToHouseDependents` — usa `web-push` lib com chaves VAPID.
- **Integração nas notificações existentes** (`src/utils/notifications.ts`): `notifyUser` e `notifyHouse` agora disparam também `sendPushToUser` / `sendPushToHouseAdmins` / `sendPushToHouseDependents` (best-effort, não bloqueia).
- **Setup automático no Dashboard** (`src/components/notifications/push-notifications-setup.tsx`): incluído nos layouts admin/dependent — pede permissão e subscreve na primeira visita.
- **Dependência `web-push`** adicionada ao `package.json` + `@types/web-push` em devDependencies.

### SQL aplicado no Supabase
```sql
-- docs/sql/push_subscriptions.sql
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  house_id uuid not null references public.houses(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
create index if not exists push_subscriptions_house_idx on public.push_subscriptions (house_id);
alter table public.push_subscriptions enable row level security;
create policy "push_subscriptions_select_own" on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy "push_subscriptions_insert_own" on public.push_subscriptions for insert to authenticated with check (user_id = auth.uid());
create policy "push_subscriptions_delete_own" on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());
create policy "push_subscriptions_select_admin" on public.push_subscriptions for select to authenticated using (exists (select 1 from public.house_members hm where hm.house_id = push_subscriptions.house_id and hm.profile_id = auth.uid() and hm.role = 'ADMIN'));
alter publication supabase_realtime add table public.push_subscriptions;
```

### Arquivos criados/modificados
- `src/utils/push.ts` — utilitários client-side VAPID/subscription
- `src/hooks/use-push-notifications.ts` — hook de permissão + subscription
- `src/actions/push.ts` — server actions CRUD + envio
- `src/utils/notifications.ts` — integração push no `notifyUser`/`notifyHouse`
- `src/components/notifications/push-notifications-setup.tsx` — client component setup
- `src/components/notifications/realtime-toast-listener.tsx` — já existia (toasts internos)
- `public/sw.js` — handlers push/notificationclick/pushsubscriptionchange
- `docs/sql/push_subscriptions.sql` — SQL da tabela
- `.env.local` — VAPID keys
- `package.json` — `web-push` + `@types/web-push`

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npm run typecheck` ✓ · `npm run build` ✓.

---

## Realtime Hook — melhoria no `usePostgresChanges` (concluída)

### Problema
O hook original tinha race conditions: canais não eram limpos corretamente antes de recriar, nome do canal podia colidir entre montagens, e o `setAuth` podia não completar antes do `subscribe()`, gerando erro "cannot add callbacks after subscribe()".

### O que foi implementado
- **Nome de canal único** por montagem: `pg-changes:${table}:${filter}:${Date.now()}:${Math.random()}` — evita colisão com canais anteriores.
- **Cleanup defensivo** antes de criar novo canal: remove canal anterior se existir (try/catch silencioso).
- **Ordem garantida**: `getSession()` → `setAuth(token)` (await) → cria canal `.on()` → `.subscribe()`.
- **Cleanup síncrono no unmount**: remove canal imediatamente sem bloquear desmontagem.
- **Flag `cancelled`** verificada no callback do payload e no status do subscribe.
- **Log de status** (`SUBSCRIBED`, `CHANNEL_ERROR`, `TIMED_OUT`, `CLOSED`) para debug.

### Arquivos alterados
- `src/hooks/use-postgres-changes.ts` — reescrito com as melhorias acima.

### Verificação
`npm run lint` ✓ · `npm run typecheck` ✓ · `npm run build` ✓.

---

## Página raiz `/` dinâmica — fix do middleware no Vercel (concluída)

### Problema
A página `/` era prerenderizada como estática (`○ /` no build). No Vercel, rotas estáticas **não passam pelo middleware/proxy**, então usuários autenticados ficavam presos em `/` sem redirecionar para o dashboard da role.

### O que foi feito
- Adicionado `export const dynamic = 'force-dynamic'` em `src/app/page.tsx`.
- Agora a raiz aparece como `ƒ /` (Dynamic) no build, forçando o proxy a rodar e redirecionar:
  - Não autenticado → `/login`
  - ADMIN → `/dashboard/admin`
  - DEPENDENT → `/dashboard/dependent`

### Arquivos alterados
- `src/app/page.tsx` — adicionado `export const dynamic = 'force-dynamic'`.

### Verificação
`npm run lint` ✓ · `npm run typecheck` ✓ · `npm run build` ✓ (build agora mostra `ƒ /`).

### Decisões
- **Push = complemento, não substituto**: toasts internos (Sonner/Realtime) funcionam com app aberto; Web Push funciona com app fechado/instalado como PWA.
- **Best-effort**: falha no envio push não derruba a ação principal (mesmo padrão das notificações in-app).
- **Permissão no primeiro uso**: o hook pede `Notification.requestPermission()` ao montar no Dashboard; se negado, não subscreve (respeita escolha do usuário).
- **Service Worker no `public/`**: Next.js serve como arquivo estático (`○ /sw.js` no build), sem compilação — compatível com `navigator.serviceWorker.register('/sw.js')`.

---

## Tutores da casa e criador da tarefa para o dependente (concluída)

### O que foi implementado
- **`getHouseTutors(houseId)`** (`src/utils/house.ts`, substitui o antigo `getHouseTutor` baseado em `owner_id`): lista **todos os ADMIN membros** da casa (`house_members.role='ADMIN'`) — dono e co-gerentes via PIN. Service role (o dependente não tem RLS de leitura de `profiles` de terceiros).
- **Dashboard do DEPENDENTE (`dashboard/dependent/page.tsx`):** o card "Seu tutor" virou **"Seu tutor"/"Seus tutores"** (título pluraliza conforme a quantidade) e lista cada ADMIN membro com avatar (ou inicial) + nome.
- **`getProfileNames(ids)`** (`src/utils/house.ts`): mapa `profile_id → full_name` (service role) para resolver o criador de tarefas.
- **Cards de tarefa do DEPENDENTE (`tasks-dependent.tsx`):** exibem **"Criada por {nome}"** (`tasks.created_by`) nos cards abertos, aguardando aprovação e concluídos; `src/app/tasks/page.tsx` monta o mapa a partir das tarefas carregadas e passa `creatorNames` ao componente (fallback "Administrador" para quem não estiver no mapa, ex.: tarefa nova via Realtime).

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npx tsc --noEmit` ✓ · `npm run build` ✓ (12 workers, `ƒ Proxy` ativo).

### Decisões
- Tutores = **todos os ADMIN membros** (não apenas o `owner_id`), coerente com o co-controle por PIN (ADR-0006).
- O criador é resolvido por mapa de nomes no servidor (service role) em vez de join na query de tarefas, evitando a ambiguidade das FKs de `tasks` para `profiles` (`created_by` × `completed_by`) e funcionando igual para ADMIN/dependente.

---

## Restaurar tarefa aprovada (concluída)

### O que foi implementado
- **`restoreTask(taskId)`** (`src/actions/tasks.ts`): ADMIN restaura uma tarefa `APPROVED` para reaproveitá-la em vez de criar outra idêntica. Transição guardada `.eq('status','APPROVED')` (impede restaurar duas vezes). Preserva **todos os dados** (título, descrição, pontos, atribuição, imagem, `house_id`, `created_by`) e **não altera os pontos já creditados** do dependente; apenas limpa a conclusão (`completed_by`/`completed_at`), zera as flags de adiamento e reinicia o **prazo para agora + 1 dia** (`due_date`), voltando o status para `PENDING`.
- **UI ADMIN (`tasks-admin.tsx`):** botão **"Restaurar"** sempre visível no cabeçalho do card em "Aprovadas" (fora do toggle colapsável); atualização otimista move o card de volta para Pendentes com o prazo novo.
- **DEPENDENTE:** a tarefa reaparece em "Suas tarefas" como `PENDING` (prazo futuro), pronta para ser concluída de novo — sem duplicar linhas em `tasks`.

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npx tsc --noEmit` ✓ · `npm run build` ✓ (12 workers, `ƒ Proxy` ativo).

### Decisões
- Restaurar **não** devolve nem debita pontos (diferente de `rejectCompletedTask` e do adiamento de `NOT_DELIVERED`): o crédito anterior é histórico e o dependente ganha novamente se concluir de novo.
- Novo prazo = agora + 1 dia (reinicia o SLA sem nascer "Atrasada"); o ADMIN pode ajustar o prazo depois via `updateTask`.
- Detalhamento do "porquê" no **ADR-0008** (`docs/adr/0008-restaurar-tarefa-aprovada.md`).

---

## Tarefa "não entregue" (NOT_DELIVERED) com penalidade (concluída)

### O que foi implementado
- **Novo status `NOT_DELIVERED`** no enum `task_status`; chip vermelho "Não entregue" e borda-accent vermelha em `task-styles.ts` (badge de SLA "Atrasada" é omitido nesse status — o chip já comunica).
- **`markTaskNotDelivered(taskId)`** (`src/actions/tasks.ts`): ADMIN marca uma tarefa **atrasada** (`due_date < now`, status `PENDING/IN_PROGRESS`) como não entregue. Transição guardada `.in('status', ['PENDING','IN_PROGRESS'])` (impede débito duplicado) e **debita `tasks.points`** de `profiles.points` via service role — o saldo **pode ficar negativo**. Falha no débito → rollback do status. Revalida `/tasks`, `/rewards` e `/dashboard/dependent`.
- ~~**Reversão (adiamento) devolve os pontos e zera a tarefa:**~~ **Superado pela seção no topo ("penalidade definitiva"):** aprovar um adiamento (`resolveTaskExtension`) ou alterar o prazo (`updateTask`) numa tarefa `NOT_DELIVERED` **reabre** a tarefa com `tasks.points = 0` e o status equivalente ao novo prazo, mas **sem devolver** os pontos ao dependente.
- **Guardas:** `completeTask` e `adminCompleteTask` rejeitam `NOT_DELIVERED` (não há "Concluir" nem "Concluir e creditar"); `updateTask` rejeita editar `points` de uma tarefa não entregue (os pontos só mudam pela reversão) e permite editar título/descrição/prazo/atribuição.
- **UI ADMIN (`tasks-admin.tsx`):** tarefa `NOT_DELIVERED` permanece na seção Pendentes com chip vermelho; botão **"Marcar como não entregue"** aparece em tarefas abertas já atrasadas; no estado não entregue some o editor de pontos, o "Concluir e creditar" e o botão de marcar, restando a edição de prazo e o banner de adiamento (com aviso de que aprovar devolve os pontos). Atualizações otimistas tratam o débito/reversão.
- **UI DEPENDENTE (`tasks-dependent.tsx`):** a tarefa continua em "Suas tarefas" com o chip "Não entregue", **sem** o botão "Concluir tarefa" e **mantendo** "Pedir mais tempo"; aviso "Marcada como não entregue. Peça mais tempo para reabrir a tarefa."

### SQL aplicado no Supabase (registro)
O valor do enum já existe no banco:
```sql
alter type public.task_status add value if not exists 'NOT_DELIVERED';
```

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npx tsc --noEmit` ✓ · `npm run build` ✓ (12 workers, `ƒ Proxy` ativo).

### Decisões
- Pontos negativos são um estado válido (penalidade integral, sem clamp em 0); resgates continuam barrados pela validação de saldo.
- `NOT_DELIVERED` é terminal até o prazo ser reaberto; reabrir (adiamento/prazo) **zera `tasks.points`**, então a tarefa reaberta não paga pontos mesmo se concluída depois.
- Detalhamento do "porquê" no **ADR-0007** (`docs/adr/0007-tarefa-nao-entregue-penalidade-e-restauracao.md`).

---

## Co-controle de casa por PIN (concluída)

### O que foi implementado
- **PIN de casa = `houses.code`:** criado junto com a casa (já existente, único); agora exibido nos cards em `/dashboard/admin/houses` com botão de copiar.
- **`joinHouseByPin(pin)`** (`src/actions/houses.ts`): outro ADMIN informa o PIN durante a criação de casa (aba "Entrar com PIN" no card "Nova casa") → valida o PIN, insere `house_members.role='ADMIN'` (se ainda não for membro; bloqueia se for DEPENDENT), define a casa como ativa e passa a controlá-la junto com o dono. `getActiveAdminHouse`/`selectHouse`/`createDependent`/`updateHouse`/`updateDependentProfile` e os `assertAdminCanManage` de tarefas/recompensas passam a validar **controle por membresia ADMIN** em vez de `houses.owner_id`.
- **`getAdminHouses(userId)`** (`src/utils/house.ts`): casas controladas via `house_members` (role ADMIN) — criadas e co-geridas. Used nas páginas admin. **Lida com o cliente service-role** (precedente de `getHouseTutors`) porque a listagem de casas/membros/atribuições (`getHouseAssignees`) não deve depender de policies RLS específicas para co-gerentes; o `userId` sempre vem da sessão.
- UI: toggle "Criar casa" / "Entrar com PIN" no card Nova casa; PIN visível/copiável em cada card de casa.

### SQL aplicado no Supabase (registro)
O banco tem `houses.code` e `house_members.role='ADMIN'`. A listagem de casas, membros e atribuições lê via service role — **não depende das policies abaixo**. Elas foram aplicadas para o **Realtime** (os canais aplicam RLS a cada subscriber) e para futuras leituras via cliente autenticado:
```sql
create policy "houses_select_for_admin_members" on public.houses
  for select to authenticated
  using (exists (
    select 1 from public.house_members hm
    where hm.house_id = houses.id
      and hm.profile_id = auth.uid()
      and hm.role = 'ADMIN'
  ));

create policy "house_members_select_for_admin_members" on public.house_members
  for select to authenticated
  using (exists (
    select 1 from public.house_members me
    where me.house_id = house_members.house_id
      and me.profile_id = auth.uid()
      and me.role = 'ADMIN'
  ));
```

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npx tsc --noEmit` ✓ · `npm run build` ✓ (12 workers, `ƒ Proxy` ativo).

### Decisões
- PIN reutiliza `houses.code` (6 caracteres, já único e gerado na criação) em vez de nova coluna — evita migração de schema; semântica de "convite/controle" já era a do campo.
- Autorização de ADMIN passou de "dono" para "membro ADMIN": a membresia é a fonte da verdade do co-controle; `owner_id` continua identificando o tutor/criador (hoje o card lista todos os tutores via `getHouseTutors`).
- Listagens de casas/membros/atribuições usam service role: RLS de `houses`/`house_members`/`profiles` não tinha (nem precisa ter) policy de leitura cross-role para co-gerentes; isolar por here, sem as policies as casas somem da UI mesmo com a query "OK" no SQL editor (que roda como superuser e ignora RLS).
- **Leituras de tarefas/recompensas também via service-role** (`/tasks` e `/rewards`): a RLS de `tasks`/`rewards`/`reward_redemptions`/`reward_suggestions` é centrada no `owner_id` da casa, então o co-gerente (e o dependente nas tarefas do co-gerente) não enxergava nada. O escopo é explícito e derivado da sessão: ADMIN → `.eq('house_id', activeHouse.id)`; DEPENDENT → `.eq('house_id', house.id).eq('assigned_to', user.id)` (ou `.eq('profile_id', user.id)` em resgates/sugestões). `getDependentHouse` também passou a usar service-role. Detalhamento do "porquê" no **ADR-0006** (`docs/adr/0006-leituras-cross-role-via-service-role.md`).
- **Limite conhecido — Realtime:** as subscriptions dos client components (`use-postgres-changes`) continuam sujeitas à RLS (não há como usar service role no browser). Sem policies de `SELECT` por membro, eventos ao vivo podem não chegar ao co-gerente/dependente; o `router.refresh()` pós-ação garante a atualização de quem age, e as policies de `SELECT` por membro (bloco acima) são a forma de habilitar o Realtime cross-role.

---

## UX de tarefas (data/hora, conclusão ADMIN e adiamento flexível)

### O que foi implementado
- **Data/hora pré-selecionada ao criar tarefa:** o campo `datetime-local` do form inicia com o agora (`nowDateTimeLocalValue` em `src/utils/datetime-local.ts`); input segue não-controlado na leitura (FormData), com `suppressHydrationWarning`.
- **Botões de ajuste rápido de prazo:** "Amanhã" (+1 dia), "+2h", "Limpar" (reseta para agora) via `modifyDateTimeLocal` — o campo virou controlado (`dueDate`). Form ganhou `md:items-start` para evitar que o grid estique as células (o input de "Pontos" não desalinha mais).
- **Bug corrigido — prazo vazio no card ADMIN:** `datetime-local` rejeitava o ISO completo do banco; `isoToDateTimeLocalValue` (`src/utils/datetime-local.ts`) converte para `YYYY-MM-DDTHH:mm`.
- **ADMIN conclui e aprova a tarefa de uma vez:** nova action `adminCompleteTask` (`src/actions/tasks.ts`) — `PENDING/IN_PROGRESS → APPROVED` com guard `.in('status', [...])`, registra `completed_by/completed_at` do ADMIN e **credita pontos**; falha na creditação reverte ao estado anterior. Botão verde "Concluir e creditar pontos" no card pendente do ADMIN, mesmo com prazo ainda válido.
- **ADMIN desaprova a conclusão do dependente:** action `rejectCompletedTask` — `COMPLETED → PENDING` com guard `.eq('status','COMPLETED')`, limpando `completed_by`/`completed_at` (o dependente refaz e marca de novo). Botão "Desaprovar" (outline) no cabeçalho do card concluído, ao lado de "Aprovar"; a transição guardada impede reabrir uma tarefa já creditada em outra aba.
- **Adiamento flexível:** `resolveTaskExtension(taskId, approve, days=3)` agora aceita dias configuráveis; banner do ADMIN ganhou os botões **Aprovar (+1 dia)** e **Aprovar (+3 dias)** além do **Rejeitar**.
- **Auto-aceite de adiamento via edição do prazo:** no `updateTask`, se `extension_requested` estiver pendente e o ADMIN alterar `due_date` para um valor diferente do atual (comparação por instante via `dueDateChanged`), as flags são limpas automaticamente e a nova data prevalece — sem passar pelos botões do banner.
- **Cards colapsáveis (só ADMIN):** em `tasks-admin.tsx` cada tarefa (pendentes, concluídas e aprovadas) tem um cabeçalho clicável (chip de status/SLA + título + pontos + chevron) que colapsa/expande o corpo; **todas vêm recolhidas por padrão** (`expandedIds: Set<string>`). O card concluído mantém o botão "Aprovar" sempre visível (fora do toggle, label encurtado no mobile); os demais detalhes (imagem, campos editáveis, prazo, botão "Concluir e creditar") ficam no corpo expandido.

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npx tsc --noEmit` ✓ · `npm run build` ✓ (12 workers, `ƒ Proxy` ativo).

### Pontos de atenção
- `dueDateChanged` compara instantes (`getTime`); desde a correção de fuso (ver seção "Bug de fuso em prazos de tarefas" no topo) todo `due_date` é `timestamptz`/ISO com fuso, então a comparação é absoluta e correta.

---

## Edição completa ADMIN, imagens, SLA, sugestões e extensões (concluída)

### O que foi implementado
- **Edição sem DELETE:** ADMIN edita casas (nome+foto), dependentes (nome/username/avatar), recompensas (título/custo/descrição/emoji/foto) e o próprio perfil (nome+avatar). `updateHouse`, `updateDependentProfile`, `updateReward`, `updateOwnProfile` — sempre validando posse via service role (`houses.owner_id`).
- **Uploads (Supabase Storage):** bucket público `casasync-media` (pastas avatars/houses/rewards/tasks/suggestions). Helper `src/utils/media.ts` (uploadMedia) + componente `ImageUpload` (prévia, remover, estado de envio). `tasks`/`houses`/`rewards` ganharam `image_url` nos cards.
- **SLA de prazos:** `src/utils/task-sla.ts` → `getTaskSlaStatus(createdAt, dueDate)`: **Atrasada** (agora > prazo; card `border-red-500 bg-red-50 text-red-700`) e **Prazo próximo** (restante ≤ 20% do total; `border-amber-400 bg-amber-50 text-amber-800`). Aplicado nos cards abertos de ADMIN e DEPENDENT via `task-styles.ts`.
- **Sugestões de recompensa (`reward_suggestions`):** dependente envia (título/descrição/custo/foto) pela loja; o ADMIN aprova (**cria a recompensa real** — transição guardada `PENDING→APPROVED` com rollback) ou rejeita. Realtime e seção "Suas sugestões" no lado do dependente.
- **Pedido de adiamento:** dependente clica "Pedir mais tempo" (justificativa obrigatória) → `tasks.extension_requested=true` + `extension_reason`. ADMIN vê banner no card pendente e **Aprova (+3 dias sobre o prazo atual ou hoje)** ou **Rejeita** (`resolveTaskExtension`). Flags limpas nos dois casos.
- **Identificação do tutor:** card "Seu tutor" no dashboard do dependente (avatar+nome do ADMIN, service role; depois generalizado para **todos os tutores** em `getHouseTutors`). `getSessionProfile` agora expõe `avatar_url`.
- **Types:** `src/types/database.ts` espelha o schema real (`image_url` nas 3 tabelas, `extension_*`, tabela `reward_suggestions` com relationships).

### SQL aplicado no Supabase (registro)
O script `supabase/migration_features.sql` criou as colunas, a tabela de sugestões (RLS select para membros da casa; escritas via service role), o bucket público `casasync-media` com policies e incluiu `reward_suggestions` na publication `supabase_realtime`. **Já aplicado** — as features de imagem/sugestão/extensão estão operacionais.

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` — `<img>` deliberado para URLs do Storage) · `npx tsc --noEmit` ✓ · `npm run build` ✓ (12 workers, `ƒ Proxy` ativo) · smoke dev: `/login` 200, `/register` 200, `/tasks`/`/rewards`/dashboards 307 (proxy).

### Decisões / pontos de atenção
- Padrão mantido: escritas só via `createAdminClient()`; autorização via sessão + posse (`assertAdminCanManage`/`owner_id`). Senhas continuam fora de estado React.
- Sugestão aprovada usa `points_cost ?? 5` se o dependente não informou custo; resgate de sugestão vira recompensa real de imediato.
- Extensão aprovada SEMPRE soma 3 dias (base: prazo atual se futuro, senão agora) — o prazo final fica no `due_date`.
- UI de upload reutilizada em 6 lugares; keeps `next/image` fora porque as imagens vivem em URL pública de Storage.

---

## UI/UX Mobile-First — redesign visual (concluída)

### Design system
- **Paleta global (`globals.css`, tokens shadcn):** background `slate-50`, texto `slate-800`, primária `blue-600` (hover `blue-700`), border/input `slate-200`, muted `slate-100`, ring azul. Cards `bg-white` com `rounded-2xl` + `border-slate-200/80` (primitiva `Card`), botões/inputs com `min-h-12` (48px de toque) e `rounded-xl`.
- **Primitivas ajustadas:** `card.tsx` (rounded-2xl, borda suave, shadow-sm), `button.tsx` (default `bg-blue-600`, tamanhos com altura mínima de 48px), `input.tsx` (min-h-12, bg-white). `layout.tsx` ganhou `bg-slate-50`/`text-slate-800`/`antialiased` e `lang="pt-BR"`.

### Cabeçalho fixo & bottom nav (dark, alto contraste)
- **Header fixo em todas as viewports** (`dashboard-nav.tsx`): `fixed inset-x-0 top-0 z-50 bg-blue-700 text-white shadow-md`, com marca (ícone `House` âmbar), **nav central no desktop** (`md:flex`, item ativo `bg-white/20`), **badge de pontos** `bg-amber-400 text-slate-900 font-bold`, avatar com inicial e nome do usuário (desktop) e `Sair` (desktop).
- **Bottom navigation mobile** escura: `fixed inset-x-0 bottom-0 z-50 bg-slate-900 text-slate-300 border-t border-white/10 pb-[env(safe-area-inset-bottom)] shadow`; item ativo com **pílula `bg-blue-600 text-white` no ícone** + label `text-sky-400`; slot de **Sair** quando há < 4 itens (dependentes).
- **Canvas (`layout.tsx`):** fundo global `bg-slate-100` (cards brancos ganham contraste); containers dos layouts admin/dependent e das páginas `/tasks` e `/rewards` passaram a `p-4 pt-20 pb-24 md:p-6 md:pt-24 md:pb-6` para conteúdo não ficar escondido atrás do header/bottom nav fixos.
- `DashboardNav` agora recebe `userName` e `points` (layouts/páginas via `getSessionProfile`).

### Cards, tarefas e recompensas
- **Tarefas (`task-styles.ts`):** mapa compartilhado de status → card com **borda esquerda colorida** (Pendente azul, Em andamento sky, Concluída âmbar, Aprovada verde) + **chip de status** e pill de pontos (`bg-sky-100 text-sky-700`). Botão "Aprovar e creditar" em verde, ícones em cada seção.
- **Recompensas:** card de saldo em gradiente azul (dependente/dashboard), emoji de recompensa, pills de custo, resgates com borda-colorida por status; "Aprovar e debitar" em verde; "Rejeitar" outline.
- **Dashboards:** header em gradiente azul ("Visão geral"/boas-vindas + casa ativa), cards de ação com ícone em chip colorido, hover lift (`-translate-y-0.5` + shadow). Houses: casa ativa com destaque azul, badges de membro por role.

### Auth
- `/login` e `/register` ganharam header de marca (ícone em quadrado azul + "CasaSync" + subtítulo) centrado, mobile-first.

### Formulários por demanda (progress disclosure)
- Exceto os de **autenticação**, todo formulário de criação só aparece ao clicar num botão: **Nova casa**, **Novo dependente** (`houses-manager.tsx`), **Nova tarefa** (`tasks-admin.tsx`) e **Nova recompensa** (`rewards-admin.tsx`).
- Padrão: `CardAction` com `Button variant="outline" size="sm"` no header do card que alterna `showXForm` (`useState`); form fecha ao sucesso (função de criar → `setShowXForm(false)`). "Novo dependente" fica `disabled` se não há casa ativa.

### Gamificação & micro-interações
- **Paleta de significado:** saldo/placar de pontos em **gradiente ouro** (`from-amber-500 via-yellow-500 to-amber-600` + `shadow-amber-500/20`); ações de sucesso em **esmeralda** (`bg-emerald-500 hover:bg-emerald-600` + `shadow-emerald-500/25`) com badges `bg-emerald-50 text-emerald-700`; hero/banners de boas-vindas em **gradiente azul→índigo** (`from-blue-600 to-indigo-600`, `rounded-3xl`, `p-6`); pills de pontos agora âmbar (`bg-amber-100 text-amber-700`).
- **Feedback tátil:** `Button` (primitiva) ganhou `active:scale-95 transition-all duration-200` global e sombra azul no variant default (`shadow-lg shadow-blue-500/25`); cards interativos e itens da bottom/top nav com `active:scale-95`/`active:scale-[0.98]`.
- **Empty states (`components/ui/empty-state.tsx`):** card centralizado com ícone grande em círculo de fundo suave, borda tracejada (`border-dashed`), título + mensagem motivacional com emoji ("Tudo limpo por aqui! 🎉", "Loja vazia por enquanto… 🎁"). Aplicado em tarefas pendentes/aprovação, loja vazia e resgates vazios (ADMIN e DEPENDENT).

### Verificação
`npm run lint` ✓ · `npx tsc --noEmit` ✓ · `npm run build` ✓ · dev smoke test: `/login` e `/register` → 200 com marca renderizada.

### Notas
- Não há rota `/perfil` hoje; no mobile o 4º slot da bottom nav é o **Sair** (para dependentes, 3 itens fixos) em vez de Perfil.
- Lucide disponível (`lucide-react`); ícones usados: `LayoutDashboard, House, ListTodo, Gift, CircleCheck, CircleCheckBig, ClipboardList, Coins, PartyPopper, Layers, LogOut`.

---

## Segurança de credenciais — senha fora do estado React (concluída)

### O que foi implementado
- **Problema:** ao registrar usuários, a senha (e o `masterPin`) ficavam em `useState` como inputs controlados (`value={password}`) e eram passados como argumentos para as Server Actions. Isso deixava a credencial visível no estado do componente (React DevTools) e serializada nos argumentos da action — vulnerabilidade percebida como "senha aparece no console".
- **Fix nos forms (`login-form.tsx`, `register-form.tsx`, `houses-manager.tsx`):** removidos os estados de senha/usuario (`useState`) — inputs viraram **uncontrolled** (só `name`), com a leitura feita via `FormData(event.currentTarget)` **no momento do submit**; a senha nunca entra no estado/árvore React do cliente e é descartada após o uso. Formulários de sucesso fazem `event.currentTarget.reset()`.
- **Server Actions blindadas (`auth.ts`, `houses.ts`):** nenhuma ação pode lançar exceção não tratada (se lançasse, o Next sobreporia erro de dev com os argumentos da requisição). `createAdminClient()` (env de service role ausente) agora é envolvido em try/catch → retorna `{ ok: false, error: 'Configuração do servidor indisponível.' }` em vez de lançar.
- **Verificação:** `npm run lint` ✓ · `npx tsc --noEmit` ✓ · `npm run build` ✓.

### Limite honesto (não corrigível só com código)
- A senha **precisa** trafegar até o servidor em qualquer login/cadastro (payload de rede / aba Network do DevTools). O que o fix garante: ela **não** fica em memória/estado React do cliente, **não** é reintroduzida por nenhum log e as ações **nunca** expõem argumentos por exceção. Em produção, o tráfego é a encriptar via HTTPS.

---

## Autenticação simplificada por PIN + Username (concluída)

### O que foi implementado
- **Cadastro de ADMIN via PIN do sistema:** a Server Action `registerAdmin` (`src/actions/auth.ts`) agora recebe `fullName`, `username`, `password` e `masterPin`. Valida `masterPin === process.env.MASTER_PIN` (env `MASTER_PIN` passou a ter uso); username precisou ser único → checado em `profiles` via service role; conta criada com `admin.auth.admin.createUser({ email: "${username}@admin.casasync", password, email_confirm: true })` — usuário já **100% confirmado** (sem e-mail de confirmação); perfil gravado em `public.profiles` (`id`, `full_name`, `username`, `user_role: 'ADMIN'`), com rollback (`deleteUser`) se o perfil falhar.
- **Login por username (`src/actions/auth.ts` `login`):** normaliza o username, resolve o domínio do e-mail sintético em `profiles` conforme a role (`@admin.casasync` para ADMIN, `@dependente.casasync` para DEPENDENT) e chama `supabase.auth.signInWithPassword` pelo cliente do servidor (cookies na própria action). Mensagem genérica "Credenciais inválidas." nos dois casos (não revela usernames existentes).
- **Dependentes também por username:** `createDependent` (`src/actions/houses.ts`) agora recebe `username` em vez de e-mail; gera o e-mail sintético `@dependente.casasync`, checa unicidade e cria a conta com `email_confirm: true`. O form em `houses-manager.tsx` trocou o campo E-mail por "Nome de usuário".
- **UI em `/login`:** abas **"Entrar"** (username + senha, válido para ADMIN e DEPENDENT no mesmo form — sem Google OAuth) e **"Criar Conta Admin"** (Nome completo, Nome de usuário, Senha, PIN do sistema) em `login-form.tsx`; `register-form.tsx` atualizado para os novos campos e reutilizado na aba e na rota `/register` (mantida como URL independente).

### Pontos de atenção / próximos passos *(histórico — já aplicado)*
- **Banco:** a coluna `profiles.username` (única, lowercase) **já existe** no Supabase e as contas foram validadas — o cadastro/login por username está operacional (ver o aviso no topo).
- Removido o login com **Google** (não faz sentido sem e-mail). `src/app/auth/callback/route.ts` ficou sem uso e foi **removido** (ver "Refresco de documentação e contexto" no topo).
- `validateCredentials`/`EMAIL_PATTERN` removidos de `actions/types.ts`; novos helpers `validateUsername` (3–24 chars, `[a-z0-9._-]`) e `validatePassword` (≥6).
- Gerar types via `supabase gen types` para casar com o schema real (inclui `username`).

---

## Manutenção pós-migração para `src/` (concluída)

### Verificação
`npm run lint` ✓ · `npx tsc --noEmit` ✓ · `npm run build` ✓ · `next dev` ✓ (rotas/proxy OK; `/login` e `/register` renderizando sem erros; rotas protegidas redirecionando para `/login`).

### Bugs reais encontrados e corrigidos
- **Login com ordem garantida (auth → `profiles`):** o login por e-mail/senha era feito no cliente e só consultava `profiles` depois, no proxy. Criada a Server Action `login` em `src/actions/auth.ts` que executa `signInWithPassword` PRIMEIRO e somente após confirmar ausência de erro de auth busca `user_role` na tabela `profiles` (via RLS) para redirecionar ao dashboard da role. As cookies são gravadas na própria action; o browser client (via `createClient`) continua sendo usado apenas no login com Google. `login-form.tsx` agora chama a action.
- **Hydration error no login/register (extensão de gerenciador de senhas):** o browser injeta `style`/botões nos inputs de e-mail/senha após o SSR → mismatch de atributos. Adicionado `suppressHydrationWarning` aos inputs afetados em `login-form.tsx`, `register-form.tsx` e `houses-manager.tsx` (fix canônico do React para o caso de extensão do navegador).
- **`updateTask` com `assigned_to: ''`:** ao desatribuir um dependente ("Sem atribuição"), uma string vazia era enviada para a coluna `uuid` → erro do Postgres. Agora `''` é normalizado para `null` (`src/actions/tasks.ts`).
- **Dropdown de atribuição sem update otimista:** o `<select>` controlado só refletia a mudança quando o Realtime ecoava (ou nunca, sem publication). Agora atualiza o estado otimista e envia `null` para desatribuir (`src/components/tasks/tasks-admin.tsx`).
- **`handleRedeem`/`handleComplete` sem catch:** se a Server Action disparasse uma exceção de rede, `pendingId` ficava travado em "Resgatando..." e a rejection ficava sem tratamento. Protegidos com `try/catch/finally` (`src/components/rewards/rewards-dependent.tsx`, `src/components/tasks/tasks-dependent.tsx`).

---

## Refatoração de estrutura (concluída)

### O que foi feito
- **Migração para `src/`:** todo o código de aplicação foi movido para uma pasta `src/` (Next.js passa a usar `src/app` como rota do App Router — detectado automaticamente).
- **`@/` alias atualizado:** `tsconfig.json` agora mapeia `"@/*": ["./src/*"]`; todas as importações `@/...` continuam resolvendo sem alteração de arquivo.
- **`proxy.ts` movido para `src/proxy.ts`:** conforme docs do Next.js 16, o arquivo de proxy deve ficar no mesmo nível de `app` (`src/app`) — build continua exibindo `ƒ Proxy (Middleware)`.
- **Route group `(auth)`:** `/login` e `/register` agora vivem em `src/app/(auth)/` (grupo de rota sem efeito na URL; `PUBLIC_PATHS` do proxy segue válido).
- **Server Actions reunidas por domínio:** `createDependent` foi mesclado em `src/actions/houses.ts` (junto de `createHouse`/`selectHouse`), removendo `actions/create-dependent.ts`.
- **`components.json` atualizado:** caminho do CSS global para `src/app/globals.css` (aliases `@/components`, `@/lib/utils`, `@/hooks` já compatíveis).
- Sem mudança de importações nos componentes (padrão já usava alias `@/`); `next-env.d.ts`, `next.config.ts` e `.env.local` permanecem na raiz.

### Nova árvore de diretórios
```
src/
├─ app/                        # Rotas do App Router (src/app)
│  ├─ (auth)/                  # Grupo de rota (sem efeito na URL)
│  │  ├─ login/page.tsx
│  │  └─ register/page.tsx
│  ├─ dashboard/
│  │  ├─ admin/                # Visão ADMIN (layout, visão geral, houses/)
│  │  └─ dependent/            # Visão DEPENDENT (layout, visão geral)
│  ├─ tasks/page.tsx           # Tarefas (role-aware)
│  ├─ rewards/page.tsx         # Recompensas (role-aware)
│  ├─ layout.tsx · globals.css · page.tsx
├─ components/                 # Componentes por domínio
│  ├─ ui/                      # Shadcn UI (button, card, input, label, separator, tabs, modal, empty-state, image-upload)
│  ├─ auth/                    # login-form, register-form, sign-out-button
│  ├─ dashboard/               # dashboard-nav, profile-editor
│  ├─ tasks/                   # debounced-field, tasks-admin, tasks-dependent, task-styles
│  ├─ rewards/                 # rewards-admin, rewards-dependent
│  ├─ houses/                  # houses-manager
│  └─ notifications/           # notifications-bell, quick-message-composer
├─ actions/                    # Server Actions por domínio
│  ├─ auth.ts · types.ts
│  ├─ houses.ts                # createHouse, selectHouse, createDependent, …
│  ├─ tasks.ts
│  ├─ rewards.ts
│  └─ notifications.ts
├─ utils/
│  ├─ house.ts                 # helpers de sessão/casa ativa
│  ├─ notifications.ts         # notifyUser/notifyHouse (best-effort), retenção e limpeza
│  ├─ quick-message.ts         # helpers da mensagem rápida (capacidade/cleanup)
│  ├─ media.ts                 # uploadMedia (bucket casasync-media)
│  ├─ task-sla.ts              # SLA de prazos
│  └─ supabase/                # server.ts, client.ts, admin.ts, middleware.ts
├─ types/
│  ├─ database.ts              # schema tipado (espelho manual)
│  └─ notifications.ts         # NotificationType (18 tipos)
├─ hooks/                      # use-postgres-changes, use-profile-points
└─ lib/
   └─ utils.ts                 # cn() (é a lib habitada; componentes ui usam pkg `cn`)
proxy.ts                        # proxy (Middleware) — raiz do src/
```
Raiz mantém: `AGENTS.md`, `PROJECT_STATUS.md`, `next.config.ts`, `tsconfig.json`, `components.json`, `eslint.config.mjs`, `.env.local`, `next-env.d.ts`, docs de ensino.

### Verificação
`npx tsc --noEmit` ✓ · `npm run lint` ✓ · `npm run build` ✓ (rotas idênticas às de antes; `ƒ Proxy (Middleware)` ativo).

---

## Etapa 3 — Casas, Tarefas, Pontos e Recompensas (concluída)

### Funcionalidades implementadas
- **Gestão de Casas (`/dashboard/admin/houses`):** ADMIN cria casas (código único gerado), alterna a **casa ativa** (cookie `casasync_active_house`), **cria contas de dependentes** (nome, e-mail, senha — vinculadas à casa ativa) e vê os membros vinculados.
- **`createDependent` estendido:** aceita `houseId` alvo; quando informado, a posse da casa é validada via service role (`.eq('owner_id', user.id)`) antes de vincular o dependente — evita vincular em casa que não pertence ao ADMIN mesmo com cliente adulterado.
- **Tarefas (`/tasks`, role-aware):**
  - ADMIN: cria tarefa para um dependente da casa (título, descrição, `due_date`, `points`); edita campos com **salvamento automático com debounce** (900 ms) e flush no blur; aprova tarefas concluídas creditando pontos.
  - DEPENDENTE: vê as próprias tarefas pendentes, marca como `COMPLETED`.
  - Aprovação: `COMPLETED → APPROVED` **soma** `tasks.points` em `profiles.points` (guards anti-crédito-duplicado + rollback).
- **Recompensas (`/rewards`, role-aware):**
  - ADMIN: cadastra recompensas (`points_cost`) e **aprova (`APPROVED`) ou rejeita (`REJECTED`)** resgates — aprovar **debita** os pontos do saldo.
  - DEPENDENTE: saldo ao vivo, catálogo e botão "Resgatar" com validação de saldo → cria `reward_redemptions` `PENDING`.
- **Realtime:** listeners `supabase.channel()` + `postgres_changes` (tarefas, recompensas, resgates e `profiles.points`) sincronizam Admin ↔ Dependente instantaneamente.

### Rotas / arquivos criados
- Rotas: `/dashboard/admin/houses`, `/tasks`, `/rewards`.
- Server Actions: `actions/houses.ts` (`createHouse`, `selectHouse`), `actions/tasks.ts` (`createTask`, `updateTask`, `completeTask`, `approveTask`), `actions/rewards.ts` (`createReward`, `requestRedemption`, `approveRedemption`, `rejectRedemption`).
- Helpers: `utils/house.ts` (`getSessionProfile`, `getActiveAdminHouse` via cookie, `getDependentHouse`, `getHouseAssignees`).
- Hooks Realtime: `hooks/use-postgres-changes.ts`, `hooks/use-profile-points.ts`.
- Componentes: `components/dashboard/dashboard-nav.tsx` (+ layouts admin/dependent), `components/houses/houses-manager.tsx`, `components/tasks/{debounced-field,tasks-admin,tasks-dependent}.tsx`, `components/rewards/{rewards-admin,rewards-dependent}.tsx`.
- `types/database.ts` — schema alinhado: `profiles.points`, `rewards.points_cost`, enums `task_status` (`PENDING/IN_PROGRESS/COMPLETED/APPROVED`) e `redemption_status` (`PENDING/APPROVED/REJECTED`).

### ENSINO (skill `teach` — documentação no código)
Sem saber se o CLD é invocável por modelo (`disable-model-invocation: true`), a documentação didática foi aplicada **no próprio código**:
- `hooks/use-postgres-changes.ts` — como o Realtime funciona (canal → assinatura `postgres_changes` → WebSocket; filter de casa + RLS = isolamento multi-tenant; cleanup obrigatório do canal).
- `hooks/use-profile-points.ts` — saldo ao vivo via UPDATE em `profiles` (defesa em camadas: filter `id=eq` + RLS).
- `components/tasks/debounced-field.tsx` — por que debounce evita uma chamada por tecla e flush no blur.
- `actions/tasks.ts` (approveTask) e `actions/rewards.ts` (approveRedemption) — transições guardadas (`COMPLETED→APPROVED`, `PENDING→APPROVED`), crédito/débito via cliente service-role e rollback em falha.

### Decisões arquiteturais / pontos de atenção
- **Padrão de escrita:** verificação de autorização SEMPRE via RLS/sessão (cliente autenticado: `houses.owner_id`, perfil ADMIN, `assigned_to`, casa do dependente); escritas sensíveis (crédito/débito de pontos, criação de usuários) via `utils/supabase/admin.ts` (service role, server-only).
- **Creditação de pontos em `profiles.points`** (não em `house_members`, como antes) — alinhado à spec da Etapa 3. Ajustar no banco: coluna `profiles.points int default 0`, remover `house_members.points`, renomear `rewards.cost → rewards.points_cost` e enums com valores em caixa alta.
- **Salvamento automático:** `useState` local + debounce com **flush no blur**; re-sincronização por `key={houseId}` (remount) em vez de `setState` em effect (exigência do novo linter `react-hooks/set-state-in-effect`).
- **Transição de status com guard:** `update().eq('status', ...)` impede crédito/débito duplicado em requisições concorrentes; falha na creditação reverte a tarefa/resgate ao estado anterior.
- **Realtime no Supabase:** as tabelas precisam estar na **publication `supabase_realtime`** (`alter publication supabase_realtime add table houses, house_members, profiles, tasks, rewards, reward_redemptions;`) e as policies SELECT existentes já controlam o que cada subscriber recebe.
- Status de tarefa imutáveis após `COMPLETED` (admin não edita mais; só aprova).

### Próxima etapa
1. Gerar types via `supabase gen types` para casar com o schema real (validação dos enums/colunas acima).
2. Garantir publication Realtime + políticas RLS no Supabase para as 6 tabelas.
3. Exibir o **código de acesso da casa** (`houses.code`) na UI para convite/registro de novos membros.
4. Estado vazio/UX de `IN_PROGRESS` e emoji de recompensas (campo `emoji` já tipado).

---

## Material de ensino — Segurança Supabase (workspace teach)

### O que foi criado
- Sessão da skill `teach` ativa (skill registrada em `skills-lock.json`, arquivos em `.agents/skills/teach/` — não em `.skills/`).
- `MISSION.md`, `RESOURCES.md`, `NOTES.md` (raiz) — workspace de ensino.
- `assets/lesson.css` — stylesheet compartilhado das lições.
- `lessons/0001-supabase-rls-defesa-em-camadas.html` — lição 1: cliente SSR (`utils/supabase/server.ts`) + RLS multi-tenant + Server Action `fetchMyTasks` de exemplo (defesa em camadas). Aberta no navegador.
- `reference/supabase-rls-security.html` — folha de referência (papéis anon/authenticated/service_role, padrão de policy seguro, checklist de armadilhas).

### Pontos de atenção
- Nenhum código de produção foi alterado; `fetchMyTasks` é ilustrativo (a tabela `tasks` ainda pertence à Etapa 4).
- Anotado como evolução futura: migrar `supabase.auth.getUser()` → `supabase.auth.getClaims()` no `updateSession` (docs atuais do Supabase preferem `getClaims()` no Proxy por validar assinatura do JWT a cada request).
- Conteúdo ensinado: autorização deriva da sessão (JWT verificado), nunca do input; RLS como backstop; padrão seguro `profile_id = (select auth.uid())` em policy multi-tenant; `user_metadata` não é lugar para claims de autorização; service role é server-only.

### Próxima etapa (ensino)
- Confirmação do quiz na lição 1 (2 perguntas) antes de registrar learning record.
- Lição 2 sugerida: escrita segura com `WITH CHECK` (INSERT/UPDATE) para tarefas e recompensas, ou `security definer` para evitá-la.
- Manter o restante da Etapa 4 do produto inalterado.

## Etapa 2 — Autenticação Completa (concluída)

### Funcionalidades implementadas
- **Shadcn UI configurado** (CLI v4, base Radix): `components/ui/{button,input,label,card,separator,tabs}.tsx` + `lib/utils.ts` + temas em `app/globals.css`.
- **Fluxo de Auth completo:**
  - Rota `GET /auth/callback`: troca `code` por sessão (Magic Link, Google OAuth, confirmação de e-mail) e redireciona para `/`.
  - Login em `/login` com abas **Administrador** (E-mail/Senha ou Google OAuth) e **Dependente** (E-mail/Senha criados pelo Admin).
  - Cadastro de novo ADMIN em `/register` (server action `registerAdmin`).
- **Criação de Dependentes pelo ADMIN:** server action `createDependent` (um DEPENDENT nunca se cadastra sozinho).
- **Proteção & redirecionamentos por role** no `proxy.ts` (via `updateSession`).

### Rotas / arquivos criados
- `app/auth/callback/route.ts` — callback do Supabase Auth.
- `app/login/page.tsx` + `components/auth/login-form.tsx` — login ADMIN/DEPENDENT (Tabs).
- `app/register/page.tsx` + `components/auth/register-form.tsx` — cadastro de ADMIN.
- `components/auth/sign-out-button.tsx` — logout.
- `app/dashboard/admin/page.tsx` e `app/dashboard/dependent/page.tsx` — placeholders protegidos por role.
- `actions/types.ts` (tipo `ActionResult` + validação), `actions/auth.ts` (`registerAdmin`), `actions/create-dependent.ts` (`createDependent`).
- `utils/supabase/admin.ts` — cliente **server-only** com `SUPABASE_SERVICE_ROLE_KEY`.
- `types/database.ts` — enums `user_role` (ADMIN/DEPENDENT) e `member_role` (ADMIN/DEPENDENT) + coluna `profiles.user_role`.
- `.env.local` — adicionado placeholder `SUPABASE_SERVICE_ROLE_KEY` (server-only).

### Decisões arquiteturais / pontos de atenção
- **`membership`:** o ADMIN precisa estar vinculado a pelo menos uma casa (`house_members`) para criar dependentes; a casa do dependente é a casa atual do ADMIN.
- **Sequência de segurança em `createDependent`:** valida sessão → confirma `user_role='ADMIN'` no perfil (via cliente autenticado, RLS) → busca `house_id` → usa o cliente admin (service role) para criar usuário (com `email_confirm: true`), upsert no perfil e vínculo em `house_members` com role `'DEPENDENT'`. Falhas intermediárias fazem cleanup (`deleteUser`).
- **Redirecionamentos centrados no `proxy.ts`:** `/` e rotas públicas (`/login`, `/register`) só são permitidas a anônimos; autenticados vão ao dashboard conforme `user_role`. Rotas `/dashboard/admin` e `/dashboard/dependent` são validadas pela role do usuário preguiçosamente no proxy.
- **Roles em caixa alta** (`'ADMIN'`/`'DEPENDENT'`) em `user_role` e `member_role` para alinhar a regra de negócio. **Validar com o schema real do Supabase.**
- `SUPABASE_SERVICE_ROLE_KEY` é **server-only** (nunca importar `utils/supabase/admin.ts` em client).
- Login dependente usa credenciais de e-mail/senha criadas pelo admin (não há Magic Link para dependentes nesta etapa).

### Próxima etapa
1. Preencher `.env.local` com chaves reais (URL, publishable key, service role key).
2. Configurar no Supabase: provedor Google OAuth habilitado, `Site URL`/`Redirect URLs` apontando para o app (ex: `http://localhost:3000/auth/callback`).
3. Etapa 3 — Gestão de Casa: criação de casa pelo ADMIN e área de criação de dependentes no `/dashboard/admin` (formulário chamando `createDependent`).
4. Etapa 4 — Tarefas e Recompensas (painéis ADMIN/DEPENDENT, aprovação de resgates).

---

## Infraestrutura de contexto para agentes (concluída)

- `docs/schema.md` — snapshot manual do schema Supabase (espelho de `src/types/database.ts`; marcadas as partes não verificáveis no código: Storage, RLS, publication Realtime). Instrução de regeneração via `supabase gen types` quando o CLI estiver linkado.
- `docs/adr/` — decisões arquiteturais extraídas do `PROJECT_STATUS.md`: `0001` (escritas service-role + transições guardadas), `0002` (username + e-mails sintéticos), `0003` (credenciais fora do estado React), `0004` (proxy Next 16), `0005` (imagens em Storage com `<img>`).
- `README.md` — substituído o boilerplate do create-next-app por guia do projeto (stack, comandos, setup, apontadores).
- `opencode.json` — corrigido caminho das skills `.skills/` → `.agents/skills/`.
- `package.json` — script `npm run typecheck` (tsc --noEmit) padronizado.
- `AGENTS.md` — §1 usa `npm run typecheck`; nova §6 Git (commits em português, curtos).
- `.github/copilot-instructions.md` — importa `@AGENTS.md` (mesmo padrão do `CLAUDE.md`).

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npm run typecheck` ✓.

---

## Notificações Internas Visuais (Toasts) + Tempo Real (concluída)

### O que foi implementado
- **Toast Provider (`src/app/layout.tsx`)**: instalado e configurado `sonner` com `Toaster` no `RootLayout`. Estilo consistente com o app: fundo branco com blur, bordas arredondadas (`rounded-xl`), sombra, ícones por tipo (success/error/info/warning).
- **Listener Global em Tempo Real (`src/components/notifications/realtime-toast-listener.tsx`)**: componente client incluído nos layouts do Dashboard (admin e dependent). Escuta `INSERT` na tabela `notifications` filtrando por `recipient_id=eq.{userId}` via `usePostgresChanges`. Ao receber uma nova notificação, dispara automaticamente o Toast correspondente (`toast[style]`) usando o `title` e `body` gravados no banco.
- **Mapeamento de tipos para estilo visual**: cada `NotificationType` (18 tipos: TASK_CREATED, TASK_APPROVED, REDEMPTION_APPROVED, QUICK_MESSAGE, etc.) mapeia para `success`/`error`/`info`/`warning` com rótulo amigável.
- **Gatilhos de Toast em Server Actions / Formulários**: adicionado `toast.success`/`toast.error`/`toast.info` nos handlers das principais ações:
  - **Admin (Tarefas)**: criar, aprovar, desaprovar, concluir+creditar, marcar não entregue, restaurar, resolver adiamento.
  - **Dependente (Tarefas)**: concluir, pedir adiamento.
  - **Admin (Recompensas)**: criar, editar, desativar/reativar, aprovar/rejeitar resgate, aprovar/rejeitar sugestão.
  - **Dependente (Recompensas)**: solicitar resgate, sugerir recompensa.
  - **Admin (Casas/Dependentes)**: criar casa, entrar por PIN, selecionar casa, editar casa, criar dependente, editar dependente, redefinir senha, alterar pontos.
- **Painel de Notificações (Sino)**: já existia e permanece funcional — badge de não lidas, lista com marcar/apagar, compositor de mensagem rápida (DEPENDENT). Agora os toasts complementam com feedback instantâneo ao receber notificações em tempo real, sem precisar abrir o sino.

### Arquivos criados/modificados
- `src/app/layout.tsx` — adicionado `Toaster` do `sonner`.
- `src/components/notifications/realtime-toast-listener.tsx` — novo componente listener global.
- `src/app/dashboard/admin/layout.tsx` e `src/app/dashboard/dependent/layout.tsx` — incluído `RealtimeToastListener`.
- `src/components/tasks/tasks-admin.tsx`, `src/components/tasks/tasks-dependent.tsx` — toasts nas ações.
- `src/components/rewards/rewards-admin.tsx`, `src/components/rewards/rewards-dependent.tsx` — toasts nas ações.
- `src/components/houses/houses-manager.tsx` — toasts nas ações de casa/dependente/senha/pontos.
- `package.json` — dependência `sonner` adicionada.

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npm run typecheck` ✓ · `npm run build` ✓.
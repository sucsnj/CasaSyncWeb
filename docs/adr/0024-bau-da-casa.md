# ADR-0024: Baú da casa — acervo de arquivos por casa

**Status:** aceito — **Data:** 2026

## Contexto
O ADMIN precisava de um lugar para guardar arquivos que serve aos dependentes
(aulas exportadas, fichas, vídeo de uma tarefa)— hoje não existe nada: o único
caminho de arquivo é o **anexo da tarefa**, que é 1:1 com a tarefa, pertence ao
ciclo dela e some quando a tarefa sai. Repetir a mesma aula em 5 tarefas, ou
disponibilizar um material que não é tarefa (uma regra da casa, um cronograma,
uma folha de exercises), não tinha caminho.

O pedido era explícito sobre **reuso**: os tipos de arquivo, o teto de tamanho e
as regras de visualização (abrir em nova aba, HTML renderizado com isolamento)
**devem ser os mesmos da tarefa**, e o novo endpoint tem que seguir as convenções
do app (rota role-aware no grupo `(app)`, shell na nav, service-role com escopo
derivado da sessão, validação fail-closed no servidor, SQL aplicado à mão antes do
deploy).

## Decisão

### Domínio: "itens do baú", uma casa por item
1. **Tabela nova `chest_items`, com `house_id`** — o baú é **da casa**, não do
   ADMIN. É o mesmo multi-tenant de `tasks`/`rewards`/`achievements`: uma coluna,
   uma policy, as cascatas já existentes, `deleteHouse` já limpa por FK. A
   alternativa (acervo pessoal do ADMIN visível em N casas, com tabela-ponte) foi
   descartada: exige uma tabela extra, regras de permissão novas e uma tela de
   gestão de visibilidade, para um ganho que só aparece para ADMIN multi-casa com
   material compartilhado entre casas — caso raro, e que se resolve trocando a
   casa ativa.
2. **Nome: `chest_items`, rota `/chest`, rótulo "Baú".** "Anexo" já é conceito
   técnico no app (o arquivo da tarefa); "documento" exclui vídeo/imagem;
   "tesouro" promete recompensa, que não existe. **"Item"** é curto, neutro e
   não implica mecânica.
3. **Só acervo**: consulta e abertura de arquivos. **Sem pontos, sem resgate, sem
   trancamento, sem notificação.** Trancar item exigiria custo, estado e regra de
   saldo — ou seja, um segundo sistema de Recompensas; e o dependente não precisa
   de aviso: o baú é uma tela que ele abre para consultar. ADR-0020 (castigo) e
   ADR-0017 (comunicados) são o precedente de "conteúdo é leitura, não evento".
4. **O ADMIN escolhe a casa na criação**, entre as casas que ele controla
   (inclusive as co-geridas). A lista da tela mostra **todos os itens de
   todas as casas dele**, com **chip do nome da casa** nos que não são da casa
   ativa — senão o item recém-criado em outra casa sumiria da tela até ele trocar
   a casa. O chip é informativo, sem troca automática: aqui ele está **gerenciando**,
   não navegando (ao contrário do sino, que precisa trocar a casa antes de
   navegar).
5. **A casa do item é fixa.** Mover exigiria mexer no filtro de Realtime e no
   cache por casa sem ganho real; excluir e recriar é raro e barato.
6. **Título apenas, 1–100 caracteres, pode repetir** (sem índice único). A busca é
   **por título**, dos dois lados, case-insensitive, em memória com `useMemo` — o
   catálogo já está no estado da tela, então uma query por tecla só somaria
   latência (mesmo critério de `rewards`).
7. **Título e arquivo editáveis de forma independente**: trocar o arquivo mantém o
   título (e apaga o antigo do storage), renomear mantém o arquivo.

### Reuso (a parte que o pedido exigia)
8. **As regras puras são as da tarefa, reexportadas.** `src/utils/chest-attachment.ts`
   reexporta tipos, 5 MB, `attachmentKind`, `attachmentKindLabel`,
   `resolveAttachmentType`, `isAllowedAttachmentType` de `src/utils/task-attachment.ts`
   e acrescenta só o que é do baú: a pasta `chest/` e
   `validateChestItemAttachment` (mesmas 3 defesas da tarefa — URL dentro de
   `chest/`, tipo na lista fechada, nome ≤120 sem caractere de controle).
9. **Props opcionais nos componentes de anexo já prontos**, em vez de copiá-los:
   `TaskAttachmentInput` ganha `folder` (default `tasks`) e `TaskAttachmentView`
   ganha `htmlHref` (default = a rota de tarefa). O comportamento da tarefa é
   **idêntico** (mesmo default, mesmo caminho), o diff é de ~4 linhas, e o baú nasce
   com **zero linhas duplicadas** dos ~120 dos componentes. A rota de HTML vira
   `src/app/api/chest-item/[itemId]/route.ts`, que reaproveita o núcleo da rota de
   tarefa — o isolamento (`CSP: sandbox allow-scripts`, sem `default-src` porque
   num documento sandboxed o `'self'` é a origem opaca) é **o mesmo defeito do
   Supabase** e a mesma defesa.
10. **HTML no baú:** o dependente vê o rótulo "Página" em vez do nome do arquivo
    (`hideFileName`), igual à tarefa — o nome de uma página exportada é ruído. Os
    bytes saem pela rota do app porque o gateway força `text/plain` em `text/html`
    (medido e documentado no `PROJECT_STATUS.md`); imagem, vídeo e PDF continuam
    pela URL pública.
11. **Pasta nova no bucket: `chest/`** (`chest/<houseId>/<uuid>.<ext>`, nome
    original só para exibição). É a mesma defesa por pasta que `tasks/`,
    `messages/` e `achievements/` já fazem: o servidor nunca aceita apontar o item
    para uma URL externa.

### Entrega e leitura
12. **Realtime, sim.** É um **catálogo** (o mesmo argumento de `rewards`): quem está
    na tela precisa ver o item novo/edição/exclusão sem F5. Custa policy de SELECT
    por membro + `alter publication supabase_realtime` — o mesmo caminho das
    conquistas.
13. **Escopo de leitura derivado da sessão**, como o resto do app: ADMIN vê os itens
    das casas onde `house_members.role = 'ADMIN'`; DEPENDENT vê os itens da **própria**
    casa, service-role (ADR-0006). Nada de parâmetro público de casa vindo do
    cliente.
14. **Aparição:** card na **Visão geral do ADMIN** e na **Visão geral do
    dependente**; item na nav **só do dependente** (4 → 5 itens). O ADMIN não ganha
    item na nav — acesso pelo card, como Comunicados (ADR-0017).
15. **Limpeza:** `deleteHouse` remove os itens por cascade (o arquivo no storage vai
    junto só no fluxo explícito/best-effort, como o resto do app). Nada é por
    dependente, então `expelMember`/`deleteDependentAccount` não entram aqui.

## Consequências
- **Ordem de deploy:** o SQL (`docs/sql/chest_items.sql` — tabela, índices, RLS,
  policy de SELECT, publication) tem de estar aplicado **antes** do deploy, senão
  a rota quebra com `relation "public.chest_items" does not exist`.
- **Teto de 5 MB e o bucket de 1 GB (plano Hobby) valem aqui também.** O baú é o
  segundo lugar do app que guarda arquivo do usuário; é o `removeStorageFile`
  best-effort na troca/exclusão que segura o crescimento quando o ADMIN troca o
  arquivo.
- O dependente passa a ter **5 itens na bottom nav** do mobile: os rótulos ficam
  mais apertados (verificar em tela na largura mais estreita) — consequência
  aceita.
- `chest-attachment.ts` é uma **fachada** sobre o módulo da tarefa. Se um dia o
  anexo da tarefa ganhar um tipo novo (ex.: áudio), a lista fechada muda **num**
  lugar e o baú herda — que é o ponto do reuso. Se a tarefa um dia for removida do
  produto, o fachada precisa virar o módulo canônico (hoje é o contrário: o
  genérico está preso ao nome da tarefa).
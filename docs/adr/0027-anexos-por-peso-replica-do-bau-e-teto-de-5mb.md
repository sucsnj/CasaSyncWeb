# ADR-0027: Anexos por peso (orçamento em bytes), réplica do baú na tarefa e teto de 5 MB no bucket

**Status:** aceito • **Data:** 2026

## Contexto

Três problemas que apareceram juntos, todos do mesmo módulo de anexo (tarefa +
baú):

1. **O limite de 50 itens falhava em falar do problema que ele existe para
   resolver.** O bucket é do plano **Hobby: 1 GB no total e compartilhado entre
   todas as casas** (ADR-0024, emenda do limite de itens). O que acaba com ele é
   **volume**, não quantidade: 50 itens de 5 MB são 250 MB, e 500 itens de 20 KB
   são 10 MB. Pior, o teto era **só do baú**, enquanto anexo também existe na
   tarefa — e o próprio ADR registrava que um teto por peso exigiria uma coluna
   `file_size` que nunca foi criada.
2. **O material do baú não aproveitava em tarefa.** O baú é o acervo de arquivos
   da casa e a tarefa é onde o dependente olha; o mesmo PDF tinha que ser
   enviado de novo.
3. **O teto de 5 MB existia em três lugares, mas só um barrava alguma coisa.** O
   `<input>` validava `file.size` (contornável), o bucket não tinha
   `file_size_limit`, e o servidor — que é quem **grava a URL que o cliente
   mandou** — não conferia tamanho nenhum.

## Decisão

### 1. Orçamento por peso: chave `attachment_budget.maxMb` (default 100 MB)

- **Substitui `chest_rules.maxItems`** (que vira chave inerte; sem migration,
  porque `house_settings.value` é jsonb — o `DELETE` opcional está em
  `docs/sql/bucket_file_size_limit.sql`). A chave mudou porque o teto deixou de
  ser "do baú": é **da casa**, contando `tasks/` **e** `chest/`.
- **Bytes vêm do storage, não de coluna nova** (`src/utils/attachment-usage.ts`):
  `storage` via Storage API com service-role, somando os objetos das duas pastas.
  É **autoritativo** (o tamanho do arquivo que existe), **não diverge**
  (arquivo trocado, órfão de upload cancelado e réplica entram sozinhos, sem
  trigger nem backfill) e **não exige migração**. Ler o objeto é mais honesto que
  uma coluna que passaria a divergir do arquivo no primeiro reenvio.
- **Um predicado só** (`attachmentBudgetExceeded`, em `utils/attachment-budget.ts`)
  para o servidor recusar e para a tela pintar. Divergir os dois já causou bug
  neste app antes (contagem no client x barreira no servidor).
- **`counted = used − freed + pending`**, e cada termo tem um dono:
  - `used` = o que já está no storage no momento da checagem;
  - `freed` = o arquivo que a escrita vai **apagar** (troca de anexo) — sem ele,
    uma casa no teto **nunca** conseguiria trocar um material grande por um menor,
    que é justamente a operação que destrava a casa;
  - `pending` = o que será acrescentado e **ainda não** está no storage — só a
    réplica do baú usa (ela é checada antes de existir).
- **Duas políticas de falha, deliberadamente diferentes:** teto por arquivo é
  **fail closed** (a URL vem do cliente; "envie de novo" resolve objeto ausente
  e leitura transitória), orçamento é **fail open** (falha transitória de
  storage não pode impedir o tutor de trabalhar — é disponibilidade, não
  segurança). Mesma linha do `checkActiveTaskLimit`/`checkChestItemLimit` que já
  existia.
- **`0` = sem teto** e não gera leitura nenhuma. Default **100 MB** (não 0, pelos
  mesmos motivos do teto antigo: o risco é o cenário sem teto).
- **Limite honesto:** contam só `tasks/` e `chest/`. Foto de perfil, casa,
  recompensa, sugestão, mensagem rápida e imagem de conquista **não** entram —
  são módulos com regra própria, e incluí-los tornaria o "N de M MB" um número
  que o ADMIN não consegue explicar. O consumo total da casa no bucket é maior
  que o mostrado.

### 2. Réplica do baú para a tarefa

- **`copyChestItemToTask(itemId)` copia o objeto** (`chest/` → `tasks/`, com a
  mesma API `storage.copy`) e devolve os 3 campos do anexo; o `TaskAttachmentInput`
  trata o resultado exatamente como o de um upload, então **nada mais no form
  muda**. É cópia **e não apontamento** porque a troca de anexo da tarefa **apaga
  o arquivo antigo** (`removeStorageFile`) — um objeto compartilhado apagaria
  material do baú, que é de outra superfície e de outro público.
- **Catálogo sob demanda**: `listChestAttachmentsForTask()` é chamado **quando o
  seletor abre**, nunca no render de `/tasks` (é uma leitura a mais numa tela
  quente, e só interessa depois que o ADMIN decidiu usar).
- **Escopo derivado da sessão:** ADMIN da casa **ativa** (é onde a tarefa vai
  nascer) e o item tem de ser **dela**; item de outra casa devolve a mesma
  resposta de "não encontrado", sem revelar existência.
- **Os dois toggles da casa (ADR-0026) precisam estar ligados.** Com o baú
  desligado, levar o material dele para uma tarefa seria **reexibi-lo** a quem o
  tutor tinha acabado de trancar.
- **Link não tem o que copiar** (`text/url`): a réplica de um link é o próprio
  endereço, e ele não ocupa storage.

### 3. Teto de 5 MB: três camadas, porque cada uma cobre um buraco da outra

1. **client** (`MEDIA_FILE_MAX_MB` em `utils/media.ts`, `TaskAttachmentInput` e
   `ImageUpload`): não gasta banda com arquivo recusado e é a única que dá
   mensagem boa, porque é a única que conhece o `file.size`;
2. **bucket** (`storage.buckets.file_size_limit = 5242880`, em
   `docs/sql/`): rede de segurança para upload que não vem deste app — e vale
   para **todas** as pastas do bucket, então o `ImageUpload` passou a recusar
   acima de 5 MB também;
3. **servidor** (`checkAttachmentFile`): o que **grava** a referência. O
   `file_size_limit` protege o upload; ele não protege o `image_url` que o cliente
   manda para o banco. Aqui a leitura do objeto é **fail closed** e a recusa é
   unificada (objeto ausente, maior que o teto, ou URL que não é do bucket).

`TASK_ATTACHMENT_MAX_MB` passou a **derivar** de `MEDIA_FILE_MAX_MB`: dois tetos
para o mesmo bucket é como a conta do storage deixa de fechar.

## Bug encontrado na entrega (caminho do objeto, 3 cópias)

O primeiro teste em tela deu `Não foi possível ler o tamanho do objeto: Object not
found` em **todo** tipo de arquivo. Causa: o app tinha **três cópias** da conta
"URL pública → caminho do objeto", e **duas estavam erradas** — faziam
`url.indexOf('/casasync-media/')` e depois `slice(at + 1)`, que corta a barra mas
**mantém o nome do bucket dentro do caminho** (`casync-media/tasks/...` em vez de
`tasks/...`). O `info()` recebia um caminho inexistente.

E o mesmo off-by-one já quebrava, silenciosamente, a limpeza do arquivo antigo:
`removeStorageFile` comparava o caminho com `tasks/`/`chest/`, a comparação nunca
casava e **nada nunca era apagado** — trocar/excluir anexo deixava o objeto
antigo no bucket (mesmo defeito na `removeAchievementImage`, que nunca apagou a
imagem da conquista).

Correção: **um parser só**, `storagePathFromUrl` (`src/utils/storage.ts`), que
corta **depois do marcador inteiro** e é reusado pelas 4 chamadas (conferir
tamanho, apagar anexo, apagar imagem de conquista, apagar imagem de mensagem
rápida). Agora que ele funciona, a limpeza do arquivo antigo **passa a acontecer
de verdade** — o que é o comportamento documentado desde o início, e o que
importa agora que o peso do bucket conta para o orçamento.

## Alternativas descartadas

- **Coluna `file_size` em `tasks`/`chest_items`**: daria o mesmo número com
  migration + backfill, e passaria a divergir do arquivo no primeiro reenvio
  (trocar anexo, órfão de upload cancelado, réplica). Ler o storage é
  autoritativo e não custa schema.
- **Teto global do bucket (1 GB ÷ casas)**: exigiria um teto configurável no
  Supabase por casa, que o app não tem como ler nem escrever, e o problema real
  é o **apetite de uma casa**, não a divisão do bucket.
- **Manter o teto de 50 itens junto com o de peso**: os dois mediam a mesma
  coisa, e o número de itens não protege o storage — só confundiria quem lê.
- **Apontar para o arquivo do baú sem copiar**: quebra em silêncio quando a
  tarefa troca o anexo (apaga o material do baú). Ver a decisão acima.
- **Copiar no `createTask`/`updateTask` (enviando `chestItemId`)**: evitaria
  arquivo órfão quando o form é cancelado, mas mudaria a assinatura das duas
  actions e o estado do input. O upload já tem esse mesmo risco hoje, então a
  réplica ficou igual a ele em vez de criar uma segunda regra.
- **`allowed_mime_types` no bucket**: o bucket é compartilhado por pastas com MIME
  diferentes (imagem, vídeo, PDF, HTML); qualquer lista fechada quebraria upload
  que hoje funciona. A lista fechada do anexo continua no servidor.
- **`unstable_cache` no peso por casa**: invalidar peso com cache exige tag em
  toda escrita de storage, e o número é barato (2 leituras) nas 2 telas que o
  mostram.

## Consequências

- **Leitura nova no caminho de escrita** (1–2 leituras de storage por anexo
  gravado): por isso ela fica **fora do caminho de leitura** — `/tasks` e
  `/dashboard/dependent` não pagam nada, e o `/chest`/Configurações leem em
  paralelo com o resto do `Promise.all`.
- **A tela do baú não desliga o botão no limite** (o antigo "Limite de itens
  atingido"): o tamanho do arquivo que está por vir só é conhecido depois do
  upload, então uma casa em 99,9 MB ainda cabe um material pequeno — desligar ali
  seria recusar o que cabe. O par certo é aviso vermelho + recusa no servidor
  (que conhece o tamanho).
- **A réplica consome orçamento dos dois lados** (baú + tarefa), que é a leitura
  honesta: são dois arquivos de verdade.
- **O botão "Usar do baú" aparece mesmo com o baú desligado** e a recusa chega
  por modal, com a ação ("Ligue a opção em Configurações"). O componente não sabe
  os toggles da casa — e saber exigiria passar a config para cada input.

## Pontos de atenção

- `attachment_budget` substitui `chest_rules`: **não reintroduzir `maxItems`** (a
  linha antiga no banco é inerte).
- O peso é medido em **`tasks/` + `chest/`**; se um dia entrarem outras pastas de
  anexo, elas entram em `ATTACHMENT_BUDGET_FOLDERS` — de propósito o resto do
  bucket ficou de fora.
- `attachmentBudgetError`/`attachmentBudgetState` recebem `used` **já** com o
  arquivo enviado (o upload é client-side): só a réplica usa `pendingBytes`.
- Nada disto é fronteira de segurança: é **disponibilidade** de storage. O que
  protege sessão/permissão continua sendo a regra de anexo (pasta + tipo fechado
  + nome) e a origem opaca do HTML (ADR-0025).
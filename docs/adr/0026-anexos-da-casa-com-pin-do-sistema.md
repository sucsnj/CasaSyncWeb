# ADR-0026: Anexos da casa ligáveis/desligáveis, com PIN do sistema

**Status:** aceito — **Data:** 2026

## Contexto

O anexo existe em dois módulos (tarefa e baú, ADR-0024) e o anexo HTML tem a tela
de aviso antes de abrir (ADR-0025). Até aqui nenhuma das duas coisas era
configurável: se a casa quisesse parar de mandar material, não tinha caminho no
app.

Três fatos do terreno moldaram a decisão, e nenhum deles é óbvio:

1. **O bucket é público** (`casasync-media`, ADR-0005). Imagem, vídeo e PDF e o
   **link** saem pela URL pública do storage — só o **HTML** passa pelo app
   (`/api/task-attachment/[taskId]`, `/api/chest-item/[itemId]`). Portanto "ninguém
   abre mais" é garantido **apenas** para o HTML; para o resto o app pode parar de
   **oferecer** o link, mas não **revogar** uma URL pública já entregue.
2. **No baú o arquivo é obrigatório** (ADR-0024, item 8): a action recusa item sem
   arquivo. Então "desligar os anexos do baú" não é uma flag cosmética — é
   **pausar o acervo inteiro**: sem arquivo não há item.
3. **A tela de aviso só existe para o dependente** (o ADMIN é quem enviou), e ela
   **não é fronteira de autorização** (ADR-0025): a barreira real é a origem opaca
   da CSP.

## Decisão

1. **Chave nova `attachments`**, com três booleanos:
   `{ tasksAllowed, chestAllowed, htmlWarning }`. Sem SQL — `house_settings` é jsonb.
   **Os três defaults são `true`**, o oposto da convenção dos tetres (`0` =
   desligado). Aqui o default desligado *mudaria* o app de toda casa existente
   (quem hoje anexa perderia a feature sem ter pedido nada); o risco a evitar é
   "casa que não configurou", não o contrário.
2. **A escrita é SÓ por `updateAttachmentSettings`, que exige o `MASTER_PIN`** — o
   mesmo PIN do sistema que valida o cadastro de ADMIN. E `updateHouseSettings`
   **recusa a chave explicitamente** (`validateSettings`), porque o `validate`
   genérico cairia no validador do final e gravaria a chave protegida sem PIN.
   Junto: `MASTER_PIN` ausente = recusa (fail closed), comparação exata (como em
   `registerAdmin`), log de tentativa com PIN errado **sem o valor do PIN**, e o
   PIN fora do estado React (ADR-0003, lido do `FormData` e descartado no `reset`).
3. **Bloqueio de escrita** no servidor: `createTask`/`updateTask` recusam anexo
   (arquivo **ou** link) quando `tasksAllowed = false`; `createChestItem`/
   `updateChestItem` idem com `chestAllowed`. **Continua permitido:** remover o
   anexo e renomear o item — é justamente a limpeza que faz sentido com a casa
   desligada.
4. **Bloqueio de leitura** onde o app é dono do arquivo: `loadHtmlAttachment`
   recusa com `attachments_disabled` → **403** nas duas rotas `/api/...`. O mapa
   motivo→status foi **subido para o núcleo** (`htmlAttachmentFailureResponse`),
   porque as duas rotas tinham cópias idênticas e o dia que uma aprendesse um
   motivo novo e a outra não, uma serviria anexo onde a outra recusa.
   **Erro de leitura do `house_settings` recusa o anexo** (fail closed) — o
   caminho oposto transformaria falha transitória em janela de liberação.
5. **`htmlWarning = false` pula a tela de aviso**: `/abrir-anexo` redireciona direto
   para a rota `/api/...`. A **barreira continua intacta** (origem opaca + CSP) —
   o que some é a tela "não digite sua senha" e a contagem de 3s. O redirect no
   servidor cobre também o link clicado antes do toggle mudar.
6. **Baú com anexo desligado = acervo pausado**, não apagado: o form de item fica
   bloqueado com a explicação, os itens **continuam listados** e o ADMIN ainda
   **exclui** o que quiser.
7. **Link conta como anexo** nos dois toggles: é anexo no mesmo sentido (gravado
   como `text/url`) e é o vetor mais fácil de redirecionar o dependente para fora.
8. **UI**: `TaskAttachmentView` ganhou `blocked` — vira chip neutro com cadeado, sem
   `href`, sem miniatura e **sem mostrar o domínio do link** (mostrar para onde o
   link ia seria entregar o que o toggle esconde). Os inputs de upload somem
   inteiros (nada de input desabilitado que convida a tentar). No baú a decisão é da
   **casa ativa** — o item nasce nela (emenda "baú por casa" no ADR-0024), então
   basta um booleano por tela, lido no mesmo `getHouseSettingsMap` das outras
   chaves.

## Alternativas descartadas

- **Chave dentro do `updateHouseSettings` genérico (com PIN só neste caso).** O PIN
  viraria argumento de uma action que muda 11 outras configurações; bastaria um
  `if` novo que não conferisse o PIN para abrir a porta. Action dedicada deixa o
  único caminho de escrita já como barreira.
- **Três toggles em três cards.** 3 PINs e 3 idas ao banco para uma decisão que o
  tutor pensa como uma coisa só.
- **Revogação real (bucket privado + URL assinada).** Revogaria mesmo, mas atinge
  **todas** as imagens do app (avatar, casa, recompensa, mensagem rápida, anexos) —
  mudança grande, para um benefício que o tutor não pediu (ele pediu parar de
  oferecer).
- **Esconder a lista do baú com os anexos desligados.** O acervo ficaria invisível
  e o ADMIN sem caminho para limpar o que não pode mais ser aberto.
- **Recusar o desligamento enquanto houver item no baú.** Forçaria a casa a esvaziar
  o acervo antes de pausar, o que é pior do que a pausa.

## Consequências

- **O que NÃO resolve:** imagem/vídeo/PDF/link já entregues continuam abrindo por
  URL pública. Isto é o limite do bucket público (ADR-0005), não uma falha da
  implementação — está registrado como limite conhecido em `docs/seguranca-anexos.md`.
- **Ligar/desligar não apaga material.** Nenhuma linha sai do banco; o storage
  continua ocupando espaço do bucket (1 GB do plano Hobby, compartilhado).
- **Com o baú pausado o item continua na lista** dos dois lados, com chip de cadeado.
- **Custo de leitura:** zero round-trip novo nas telas que já liam settings da casa
  (o getter entra no mesmo `getHouseSettingsMap`); **+1 consulta** no `/chest` do
  ADMIN (a leitura multi-casa com `.in()`), que não tinha leitura de settings antes.
- **Desligar o aviso não enfraquece o isolamento**, só remove a camada humana. A
  proteção de sessão (origem opaca) é a do ADR-0025 e não muda.
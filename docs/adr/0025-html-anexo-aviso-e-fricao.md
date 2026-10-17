# ADR-0025: Anexo HTML servido em origem opaca, com aviso e fricção antes de abrir

**Status:** aceito — **Data:** 2026

## Contexto
O anexo aceita página HTML (ADR-0024), e o Supabase Storage **força**
`Content-Type: text/plain` em `text/html` — mitigação de XSS deliberada e
by-design. Sem contornar isso, abrir o anexo mostraria o **código** da página. O
contorno é o app servindo os bytes por uma rota própria
(`/api/task-attachment/[taskId]`, `/api/chest-item/[itemId]`) com
`CSP: sandbox allow-scripts`.

Isso já estava implementado e correto no essencial: **sem `allow-same-origin`, o
documento roda em origem opaca**, então uma página maliciosa no anexo não lê
cookie, não vê `localStorage`, não acessa o DOM do app, não abre aba
(`allow-popups` fora) e não redireciona a aba que a abriu (`allow-top-navigation`
fora). **A sessão não é roubada.**

O que o sandbox **não** faz é calar a página. Sem `default-src`/`connect-src` (de
propósito, para o CSS e o JS da página funcionarem), o HTML pode **exibir qualquer
coisa** e **falar com a internet** (`fetch`/`XHR` liberados). Ou seja: o anexo
pode desenhar uma **tela falsa de login** do CasaSync, com a barra de endereço
mostrando o domínio do app, e capturar o que a criança digitar. Não é XSS — é
phishing, e depende só da paciência de quem lê.

## Decisão
1. **Aviso obrigatório antes de abrir, só para o dependente.** O clique no chip de
   HTML vai para `/abrir-anexo?kind=…&id=…` (`src/app/abrir-anexo/page.tsx`), uma
   tela **do próprio app** que diz, em linguagem direta, de quem o material veio e
   que senha não se digita ali. O ADMIN não passa por ela (é quem enviou) e
   imagem/vídeo/PDF seguem diretos pela URL do storage.
2. **Linguagem de criança, sem jargão.** O texto não explica sandbox nem origem
   opaca: "Você está prestes a abrir um arquivo enviado por [Nome do Tutor]" e
   "🚨 REGRA IMPORTANTE: Nunca digite sua senha ou dados do CasaSync dentro desta
   página." Explicação técnica numa tela de aviso só ensina a criança a passar por
   ela.
3. **Fricção proposital: contagem de 3s + caixinha de confirmação**
   (`src/components/attachments/open-html-attachment.tsx`). Criança clica no
   primeiro botão que vê, sem ler; então o botão **não existe** por 3 segundos
   (rótulo "Aguarde 3s…") e, depois, só habilita com "[ ] Entendi que não devo
   digitar minha senha" marcada. **Os dois juntos**: a contagem quebra o reflexo
   (não há o que clicar), e a caixinha faz a regra ficar. A caixinha sozinha não
   resolveria — é **um clique**, ou seja, só deslocaria o reflexo.
4. **Diferenciação visual forte**, para a criança perceber que saiu do app:
   fundo **neutro escuro** (`bg-slate-900` — o app é `bg-slate-100`) e uma
   **faixa âmbar no topo**, largura toda, "Conteúdo Externo do Tutor". A tela
   também fica **fora do route group `(app)`**: sem nav, o contexto mudado fica
   óbvio, e o shell custaria as leituras de sino/castigo/comunicados sem servir
   para nada ali.
5. **A autorização foi extraída para um núcleo só**
   (`src/utils/attachment-html.ts`, `loadHtmlAttachment`). Antes ela vivia
   escrita dentro de cada rota de API; com a tela de aviso, a mesma regra
   existiria em **três** arquivos, e o primeiro que esquecesse abriria anexo de
   outra pessoa. `meta: true` resolve quem enviou e a casa (2 leituras em
   `Promise.all`) **só na tela de aviso** — as rotas não pagam round-trip à toa.
   Os status HTTP seguem idênticos (401 sem sessão, 403 sem permissão, 404 sem
   anexo, sem revelar existência).
6. **A neutralidade de origem não mudou.** `sandbox allow-scripts`, `nosniff` e
   `no-store` seguem idênticos: o aviso é uma camada **antes**, não uma
   substituição.

## Emenda (CSP restritiva no anexo HTML)

O aviso cobre o lado **humano** do phishing. Do lado técnico, a política de
recursos também foi endurecida, sem tirar a renderização:

```
sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' https:;
style-src 'unsafe-inline' https:; img-src data: blob: https:; media-src data: blob: https:;
font-src data: https:; connect-src 'none'; form-action 'none'
```

**O que fecha:** `fetch`/XHR/WebSocket/`sendBeacon` (`connect-src 'none'`),
submissão de formulário, `<iframe>`/`<object>`/Web Worker e `<link rel=prefetch>`
(`default-src 'none'`). Continua liberado: script inline, `eval()`, CSS inline,
script/estilo **externo** em `https:` e imagem/vídeo/fonte em `https:`.

**Correção de 2ª rodada (achada em tela):** a primeira versão desta emenda tinha
`script-src`/`style-src` **sem `https:`**, e o anexo passou a abrir **sem CSS e sem
script** — o material do tutor é página de verdade (folha de estilo de CDN,
biblioteca de JS, fonte da web), então a política nova havia matado o próprio caso
de uso. A correção **amplia o que já estava aberto** em vez de abrir canal novo:
o script remoto continua sem `fetch`, sem formulário e sem acesso ao app, e pode
fazer exatamente o que o script inline já fazia (beacon e navegação).

**`'self'` virou `'none'` de propósito:** num documento sandboxed a origem é opaca
(`null`), então `'self'` **não casa com nada** — não é o CasaSync, é um valor que
não corresponde a nenhuma origem. Escrever `'self'` ali documentaria uma
permissão que não existe.

**O residual é honesto e não fecha por CSP:** `img-src https:` ainda aceita uma
imagem montada com dado digitado (beacon), e **nenhuma CSP bloqueia navegação**
(a diretiva `navigate-to` foi removida da especificação e nunca foi
implementada) — a página pode navegar a si mesma com o dado na URL. Restringir
`img-src` a `data: blob:` mataria o beacon mas **não** a navegação, e ainda
quebraria imagem externa. **A decisão que carrega o risco é `allow-scripts`**:
sem ele não existe exfiltração nenhuma, ao custo de quebrar anexo que precise de
JavaScript. Por isso o aviso + fricção continuam sendo o controle real.

## O que isto não é
- **Não é fronteira de autorização.** Quem souber a URL crua pula o aviso — e
  pode, porque o aviso é sobre confiança, não permissão. A autorização real
  continua em `loadHtmlAttachment` e nas rotas.
- **Não desliga o phishing** para quem já foi avisado e cliqueou mesmo assim. Ele
  derruba a **surpresa**, que é o vetor que se salva: material do tutor que de
  repente vira tela de login.

## Alternativas descartadas
- ~~**`connect-src 'none'`** no CSP das rotas~~ — **superado pela emenda acima**:
  adotado, mas com `img-src`/`media-src`/`font-src` liberando `https:` para não
  quebrar imagem externa e webfont. O custo aceito foi o **beacon por imagem**,
  que continua possível (e a navegação, que nenhuma CSP fecha).
- **Não renderizar (download)**: resolve o phishing inteiro, mas volta ao problema
  original (baixar em vez de ver) e põe um passo a mais na frente da criança —
  chegou a ser avaliado nesta mesma revisão.
- **Tirar `allow-scripts`** (renderizar sem JS): mata phishing por script e
  exfiltração, mas quebra página que precise de JavaScript — boa parte do
  material de aula.
- **Servir como download** (`Content-Disposition: attachment`): risco zero, e foi
  avaliado a sério nesta revisão — mas volta ao problema original (baixar em vez
  de ver) e põe um passo a mais na frente da criança. Escolha do usuário:
  **renderiza com a política restritiva** em vez de baixar.
- **Aviso como banner dentro da página servida**: mostraria o aviso *dentro* do
  documento controlado pelo tutor — que pode esconder ou imitar. Por isso o aviso
  é uma tela do app, antes.
- **CSP para bloquear navegação**: não existe. A diretiva `navigate-to` foi
  removida da especificação e nunca foi implementada; nenhum
  `Content-Security-Policy` impede o clique de abrir o site.

## Consequências
- **Um render a mais** antes de abrir HTML (a tela do aviso). É o preço deliberado
  da fricção, e só existe para o dependente.
- **O aviso continua acessível direto pela URL**, então ele não serve de
  bloqueio técnico — serve de sinal. Quem implementa proteção real aqui é a
  origem opaca.
- **Se o autor do material for removido** (`created_by` vira nulo por
  `on delete set null`), o texto cai para "seu tutor" — o aviso nunca mostra
  "undefined".
- **PDF é da mesma classe social** (pode exibir tela falsa), mas o viewer do
  browser bloqueia JS e submissão de PDF, então o risco é bem menor e ficou fora
  do escopo. **SVG foi excluído** da lista de anexos e do `ImageUpload` — SVG é
  capaz de executar script e seria servido na origem do storage.
# ADR-0028: Android via Capacitor como wrapper remoto (sem export estático)

**Status:** aceito · **Data:** 2026

## Contexto

O CasaSync é um Next.js 16 App Router com RSC, 12 módulos de Server Actions, rotas `/api/*` para anexos autenticados, sessão por cookie no `proxy.ts` e autorização sempre derivada da sessão (incluindo service role no servidor). O Capacitor executa a interface dentro de um WebView no aparelho e **não** tem servidor Node.

Havia dois caminhos:

1. **Export estático** (`output: 'export'`): exigiria reescrever todas as páginas para Client Components, eliminar Server Actions e API routes, mover regras de pontos, PIN e penalidades para RPC/Edge Functions e trocar a sessão SSR por client SDK. Seriam semanas de trabalho com regressão do modelo de segurança.
2. **Wrapper remoto:** o WebView carrega o site já publicado, mantendo todo o backend como está.

## Decisão

- O APK é um **wrapper remoto** (`capacitor.config.ts` → `server.url`), com a URL padrão `https://casa-sync-web.vercel.app` e override por `CAPACITOR_SERVER_URL` no build.
- O shell nativo é mínimo e vive na web (`src/components/native/native-shell.tsx`), ativo apenas quando `Capacitor.isNativePlatform()`:
  - `SystemBars` (Capacitor 8) para edge-to-edge, com ícones claros no topo azul e escuros em login/cadastro/anexo;
  - splash screen;
  - botão voltar: usa o histórico do WebView e, na raiz, minimiza o app;
  - safe areas via `viewportFit: 'cover'` + `env(safe-area-inset-*)`.
- Navegação: mesma origem permanece no WebView (anexos HTML autenticados); outra origem abre no navegador do sistema (comportamento nativo do Capacitor).
- Web Push e service worker ficam desligados dentro do APK; push nativo (FCM) fica fora do escopo desta decisão.
- Falha de rede cai em `capacitor/www/offline.html` (`server.errorPath`).

## Consequências

- **Positivo:** nenhuma reescrita; RSC, Server Actions, cookies, RLS e Realtime seguem intactos; cada deploy web atualiza o app no próximo carregamento.
- **Negativo:** o app exige internet; não há funcionamento offline real; não há Web Push nativo; a URL fica embutida no APK (trocar exige `cap:sync` + rebuild); depende do Android System WebView atualizado.
- Se um dia for necessário offline de verdade ou distribuição com bundle local, o caminho passa a ser export estático + Supabase client/RPC — decisão que merece uma nova ADR.

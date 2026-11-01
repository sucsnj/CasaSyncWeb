# CasaSync Web

Sistema de organização familiar com gamificação: **casas**, **tarefas com pontos**, **recompensas/resgates**, **sugestões** e **notificações**. Multi-tenant (Admin → Casas → Dependentes) com isolamento por `house_id`, co-controle de casa por PIN (`houses.code`), login por username (e-mails sintéticos) e autorização sempre derivada da sessão — leituras cross-role via service role (ver ADR-0006).

## Stack
- Next.js 16 (App Router em `src/`, `proxy.ts` no lugar de middleware) + React 19 + Tailwind 4 + shadcn/ui + lucide-react
- Supabase (Auth, Postgres, Realtime, Storage)
- Android via Capacitor 8 (wrapper remoto — ver ADR-0028)

## Funcionalidades
- **Auth por username:** ADMIN cadastra-se com o PIN do sistema (`MASTER_PIN`); DEPENDENT é criado pelo ADMIN (nunca se cadastra sozinho). Sem e-mails reais — `${username}@admin.casasync` / `${username}@dependente.casasync`, criados já confirmados.
- **Casas:** criação, código/PIN de convite copiável (outro ADMIN entra com o PIN e co-gerencia) e troca da casa ativa (cookie). Gestão de contas de dependentes, **reset de senha** pelos ADMINs (só o autor da casa redefine a senha de outros membros) sem e-mail (ver ADR-0011) e **alteração manual do saldo de pontos** de um dependente protegida pelo **PIN da casa** (`houses.code`; ver ADR-0012).
- **Tarefas:** ciclo `PENDING → COMPLETED → APPROVED` (aprovação credita pontos), desaprovação, **"não entregue"** com penalidade (o saldo pode ficar negativo), **restauração** de tarefas aprovadas, SLA de prazo e **pedido de adiamento** (+1/+3 dias).
- **Recompensas:** catálogo, resgate com validação de saldo, aprovação/rejeição de resgates, **sugestões** enviadas pelo dependente e **desativação** pelo ADMIN (a recompensa fica "indisponível" para o dependente — nunca excluída; só o ADMIN reativa).
- **Notificações:** sino no cabeçalho azul para "o outro lado" da ação (dependente ↔ ADMINs), marcar como lida/todas, apagar uma/todas; lidas são apagadas após 5 dias. **Mensagem rápida** do DEPENDENT para os tutores (texto ≤100 caracteres + até 1 imagem da galeria ou câmera ao vivo, retenção "2 lidas → apaga a mais antiga"). Ver ADR-0009.
- **Realtime:** sincronização ao vivo de tarefas, recompensas, resgates, sugestões, saldo e notificações (ver ADR-0010 — o cliente faz `setAuth` da sessão antes de assinar).
- **Interface:** cabeçalho fixo azul + bottom nav no mobile; o **avatar** abre o `Modal` "Sua conta" com **Sair** (disponível em qualquer largura) e o saldo de pontos aparece **só para o DEPENDENT** (ADMIN não acumula pontos).
- **Uploads:** bucket público `casasync-media` (avatars, casas, recompensas, tarefas, sugestões + `messages` da mensagem rápida).

## Comandos
```bash
npm run dev        # dev server
npm run build      # build de produção (rode antes do dev p/ evitar conflito de .next)
npm run lint       # eslint
npm run typecheck  # npx tsc --noEmit

npm run cap:sync   # copia plugins/config para o projeto Android
npm run cap:open   # abre o android/ no Android Studio
npm run cap:run    # build debug + instala no aparelho/emulador
npm run android:debug # APK debug em android/app/build/outputs/apk/debug/
npm run android:apk # APK release (exige keystore configurado)
```

Sem testes configurados. Verificação antes de entregar: **lint → typecheck → build** (warnings `no-img-element` são esperados — `<img>` é deliberado para URLs do Storage).

## Setup
1. `npm install`
2. `.env.local` (não versionado) com `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `MASTER_PIN` (cadastro de ADMIN). Sem `PIN_PTS`: a alteração manual de pontos de dependente usa o PIN da casa (`houses.code`).
3. Supabase: schema, RLS e publication Realtime. **Todos os scripts SQL já foram aplicados** neste projeto (colunas de imagem — incl. `rewards.active` e `notifications.image_url`/`message_id` da mensagem rápida —, tabela `notifications` + policy de SELECT em `recipient_id`, enum `NOT_DELIVERED`, `reward_suggestions`, publicação e bucket público `casasync-media`). Para um projeto novo, ver `docs/schema.md` e os blocos de SQL em `PROJECT_STATUS.md` (registro histórico). Migrações não ficam no repo.

## Android (Capacitor)
O APK é um **wrapper remoto**: o WebView carrega o site publicado (`server.url` em `capacitor.config.ts`), então RSC, Server Actions e login por cookie seguem funcionando. Não é um export estático.

1. Deploy do site precisa estar acessível em HTTPS.
2. `npm run cap:sync` (ou `npx cap sync android`).
3. `npm run cap:open` para o Android Studio, ou `npm run cap:run` com aparelho/emulador conectado.
4. APK debug: `npm run android:debug` (saída em `android/app/build/outputs/apk/debug/`). Release: `npm run android:apk` com keystore configurado em `android.buildOptions` (`keystorePath`, `keystorePassword`, `keystoreAlias`, `keystoreAliasPassword`).

- **Trocar a URL:** `CAPACITOR_SERVER_URL=https://outro-dominio.com npm run cap:sync` e rebuilde o APK (a URL fica embutida).
- **Package:** `br.com.casasync.app`. **Nome:** CasaSync.
- **Pré-requisitos:** JDK 17+ e Android SDK (compileSdk 36). O `android/local.properties` é local e não versionado.
- **Ícones/splash:** fonte em `assets/icon.png`; regenere com `npx @capacitor/assets generate --android --iconBackgroundColor '#ffffff' --iconBackgroundColorDark '#ffffff' --splashBackgroundColor '#ffffff' --splashBackgroundColorDark '#ffffff'`.
- **Limitações:** Web Push e service worker ficam desligados no APK; push nativo exigiria FCM + `@capacitor/push-notifications`. Atualizações do site chegam no próximo carregamento.

## Estrutura
```
src/
├─ app/            # rotas do App Router (+ grupo (auth): /login, /register)
├─ actions/        # Server Actions por domínio (auth, houses, tasks, rewards, notifications)
├─ components/     # ui/ · auth/ · dashboard/ · tasks/ · rewards/ · houses/ · notifications/ · native/
├─ hooks/          # use-postgres-changes · use-profile-points
├─ utils/          # house · notifications · media · task-sla · supabase/{server,client,admin,middleware}
├─ types/          # database · notifications
└─ proxy.ts        # proxy (substitui middleware no Next 16)

capacitor/www/     # fallback local (loading/offline) do WebView
android/           # projeto nativo gerado pelo Capacitor
capacitor.config.ts
```

## Guias
- `AGENTS.md` — convenções e regras de negócio (obrigatório ler antes de codar)
- `PROJECT_STATUS.md` — estado do projeto / changelog (ler antes e atualizar ao terminar)
- `docs/schema.md` — snapshot do schema Supabase
- `docs/adr/` — decisões arquiteturais (o "porquê")

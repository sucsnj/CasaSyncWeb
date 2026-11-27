# CasaSync Web

Sistema de **gamificação familiar multi-tenant**: tutores (ADMIN) criam tarefas, recompensas, conquistas, comunicados, anexos e um baú de arquivos para dependentes (DEPENDENT) em "casas" isoladas. Dependentes concluem tarefas, ganham pontos, resgatam recompensas e desbloqueiam conquistas. Roda como **PWA** e como **app Android empacotado via Capacitor** (push FCM, detecção nativa de rede, login biométrico).

Multi-tenant com isolamento por `house_id`; controle por `house_members.role` (ADMIN/DEPENDENT), não por `houses.owner_id` (que define apenas ações de "dono"). Login por username com e-mails sintéticos. Autorização sempre derivada da sessão; leituras cross-role via service role (ADR-0006).

## Stack

- Next.js 16 (App Router em `src/`, `proxy.ts` no lugar de middleware) + React 19 + Tailwind 4 + shadcn/ui + lucide-react
- Supabase (Auth, Postgres, Realtime, Storage)
- `@tanstack/react-query` + `@tanstack/react-query-persist-client` + `idb-keyval` — cache por tenant persistido em IndexedDB (Local-First, ADR-0029)
- `@capacitor/android` (+ `@capacitor/network`, `@capacitor/push-notifications`, `@capacitor/preferences`, `@capgo/capacitor-native-biometric`) — build Android com push FCM, rede nativa e login biométrico

## Funcionalidades

### Autenticação & Contas
- **Login por username:** ADMIN cadastra-se com o PIN do sistema (`MASTER_PIN`); DEPENDENT é criado pelo ADMIN (nunca se cadastra sozinho). E-mails sintéticos `${username}@admin.casasync` / `${username}@dependente.casasync`, criados já confirmados.
- **Credenciais fora do estado React:** senha e `masterPin` nunca em `useState`/inputs controlados (ADR-0003).
- **Login rápido biométrico (Android):** cofre multi-conta no Android Keystore guarda a senha por `userId`; card biométrico lê a senha e autentica via `login` normal (ADR-0030).
- **Logout:** limpa memória + IndexedDB; `signOut()` padrão (cofre independe da sessão).

### Casas & Membros
- Criação de casa, código/PIN de convite copiável (outro ADMIN entra com o PIN e co-gerencia), troca da casa ativa (cookie).
- Gestão de contas de dependentes, **reset de senha** pelos ADMINs (só o autor da casa redefine a senha de outros membros) sem e-mail (ADR-0011).
- **Alteração manual do saldo de pontos** de um dependente protegida pelo **PIN da casa** (`houses.code`) (ADR-0012).
- Expulsar membros, excluir casa, excluir conta de dependente.

### Tarefas
- Ciclo `PENDING → COMPLETED → APPROVED` (aprovação credita pontos), desaprovação.
- **"Não entregue"** com penalidade (saldo pode ficar negativo).
- **Restauração** de tarefas aprovadas (`APPROVED → PENDING`, novo prazo).
- **Em espera (`ON_HOLD`):** pausa tarefas, esconde do dependente, descarta adiamentos.
- SLA de prazo, **pedido de adiamento** (+1/+3 dias, limite por tarefa).
- **Decaimento de pontos** por janela de tempo (`task-decay.ts`).
- Anexo (imagem/vídeo/PDF/HTML ou link) por tarefa, com aviso de fricção para HTML (ADR-0025).

### Recompensas
- Catálogo, resgate com validação de saldo, aprovação/rejeição de resgates.
- **Sugestões** enviadas pelo dependente; aprovação pelo ADMIN converte em recompensa.
- **Desativação** pelo ADMIN (fica "indisponível", nunca excluída).

### Conquistas (Gamificação)
- Métricas: `TASKS_APPROVED`, `TASKS_REJECTED`, `REWARDS_CLAIMED`, `CUSTOM_REWARDS_APPROVED`, `APP_LOGIN_DAYS`, `STREAK_LOGIN_DAYS`, `EARNED_POINTS`, `MANUAL`.
- Repetíveis (sobem de nível até o cap) e não repetíveis (resgate só no Nível 1).
- Secretas, imagem própria, ajuste manual pelo ADMIN.
- Progresso rastreado via `dependent_stats`.

### Comunicados
- Avisos da casa que o dependente **precisa confirmar** (overlay bloqueante).
- Rascunho/publicado, repetição por dependente (período, dias da semana, horário no fuso da casa).
- Confirmação por **palavras** ou por **respostas** (dropdown embaralhado, validação no servidor, subtração de pontos em erro).
- "Zerar confirmações".

### Baú da Casa
- Acervo de arquivos (imagem/vídeo/PDF/HTML) e links por casa. Consulta (sem pontos/notificação). Máx. 50 itens.

### Castigo do Dependente
- Apenas indicador (não altera pontos/tarefas). Substitui ao reaplicar; expiração avaliada na leitura.

### Configurações (por casa)
- 9 chaves: `reward_pricing`, `quick_message`, `task_sla`, `extension_rules`, `notification_retention`, `notification_mute`, `task_decay`, `task_rules`, `house_timezone`.
- Anexos da casa (toggles + PIN do sistema para alterar).
- Fuso horário (IANA, DST-aware).

### Notificações & Push
- Sino no cabeçalho para "o outro lado" da ação; marcar como lida/todas; apagar.
- **Mensagem rápida** do DEPENDENT para os tutores (texto ≤100 chars + imagem, retenção por leitura).
- **Push híbrido:** Web Push (VAPID) na web, FCM nativo no Android.
- Realtime: sincronização ao vivo de tarefas, recompensas, resgates, sugestões, saldo e notificações (ADR-0010).

### Offline-First
- Rotas de topo são shells estáticos servidos instantaneamente; dados do cache em IndexedDB com refetch em background.
- `OfflineBanner` no rodapé (via `@capacitor/network` no nativo). Sem rede, telas abrem com o que está salvo e sincronizam no retorno.

### Interface
- Cabeçalho fixo azul + bottom nav no mobile; avatar abre o Modal "Sua conta" com Sair; saldo de pontos aparece só para o DEPENDENT.

## Comandos

```bash
npm run dev        # dev server
npm run build      # build de produção (rode antes do dev p/ evitar conflito de .next)
npm run lint       # eslint (--max-warnings 0)
npm run typecheck  # npx tsc --noEmit
npm run check:encoding  # valida encoding dos arquivos
```

Sem testes configurados. Verificação antes de entregar: **lint → typecheck → build** (warnings `no-img-element` são esperados — `<img>` é deliberado para URLs do Storage).

## Setup

1. `npm install`
2. `.env.local` (não versionado) com `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `MASTER_PIN` (cadastro de ADMIN). Sem `PIN_PTS`: a alteração manual de pontos de dependente usa o PIN da casa (`houses.code`).
3. Supabase: schema, RLS e publication Realtime. **Todos os scripts SQL já foram aplicados** neste projeto. Para um projeto novo, ver `docs/schema.md` e os blocos de SQL em `PROJECT_STATUS.md`. Migrações não ficam no repo.
4. Android (opcional): `npx cap sync android`, `cd android && .\gradlew assembleDebug`. Requer `google-services.json` em `android/app/`.

## Estrutura

```
src/
├─ app/            # rotas do App Router (+ grupo (auth): /login, /register)
├─ actions/        # Server Actions por domínio (auth, houses, tasks, rewards, notifications, comunicados, settings, *-reads.ts)
├─ components/     # ui/ · auth/ · dashboard/ · tasks/ · rewards/ · houses/ · notifications/ · alerts/ · comunicados/ · screens/ · session/
├─ hooks/          # use-postgres-changes · queries/*
├─ lib/            # query/{query-client,persist,keys,upsert,session-scope}
├─ utils/          # house · notifications · media · task-sla · task-decay · tenant-scope · timezone · biometric-vault · recent-accounts · supabase/{server,client,admin,middleware}
├─ types/          # database · notifications
└─ proxy.ts        # proxy (substitui middleware no Next 16)
```

## Guias

- `AGENTS.md` — convenções e regras de negócio (obrigatório ler antes de codar)
- `PROJECT_STATUS.md` — estado do projeto / changelog (ler antes e atualizar ao terminar)
- `docs/schema.md` — snapshot do schema Supabase
- `docs/architecture.md` — arquitetura, Supabase, Capacitor, biometria
- `docs/business-rules.md` — regras de negócio
- `docs/glossary.md` — glossário de domínio
- `docs/seguranca-anexos.md` — retrato de segurança dos anexos
- `docs/adr/` — decisões arquiteturais (o "porquê")
- `docs/adr-index.md` — índice dos ADRs
- `log.md` — relatório completo do escopo atual

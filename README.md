# CasaSync Web

Sistema de organização familiar com gamificação: **casas**, **tarefas com pontos**, **recompensas/resgates**, **sugestões** e **notificações**. Multi-tenant (Admin → Casas → Dependentes) com isolamento por `house_id`, co-controle de casa por PIN (`houses.code`), login por username (e-mails sintéticos) e autorização sempre derivada da sessão — leituras cross-role via service role (ver ADR-0006).

## Stack
- Next.js 16 (App Router em `src/`, `proxy.ts` no lugar de middleware) + React 19 + Tailwind 4 + shadcn/ui + lucide-react
- Supabase (Auth, Postgres, Realtime, Storage)

## Funcionalidades
- **Auth por username:** ADMIN cadastra-se com o PIN do sistema (`MASTER_PIN`); DEPENDENT é criado pelo ADMIN (nunca se cadastra sozinho). Sem e-mails reais — `${username}@admin.casasync` / `${username}@dependente.casasync`, criados já confirmados.
- **Casas:** criação, código/PIN de convite copiável (outro ADMIN entra com o PIN e co-gerencia) e troca da casa ativa (cookie). Gestão de contas de dependentes e **reset de senha** de qualquer membro (dependente ou co-ADMIN) pelo ADMIN, sem e-mail.
- **Tarefas:** ciclo `PENDING → COMPLETED → APPROVED` (aprovação credita pontos), desaprovação, **"não entregue"** com penalidade (o saldo pode ficar negativo), **restauração** de tarefas aprovadas, SLA de prazo e **pedido de adiamento** (+1/+3 dias).
- **Recompensas:** catálogo, resgate com validação de saldo, aprovação/rejeição de resgates e **sugestões** enviadas pelo dependente.
- **Notificações:** sino no cabeçalho azul para "o outro lado" da ação (dependente ↔ ADMINs), marcar como lida/todas, apagar uma/todas; lidas são apagadas após 5 dias. Ver ADR-0009.
- **Realtime:** sincronização ao vivo de tarefas, recompensas, resgates, sugestões, saldo e notificações.
- **Uploads:** bucket público `casasync-media` (avatars, casas, recompensas, tarefas, sugestões).

## Comandos
```bash
npm run dev        # dev server
npm run build      # build de produção (rode antes do dev p/ evitar conflito de .next)
npm run lint       # eslint
npm run typecheck  # npx tsc --noEmit
```

Sem testes configurados. Verificação antes de entregar: **lint → typecheck → build** (warnings `no-img-element` são esperados — `<img>` é deliberado para URLs do Storage).

## Setup
1. `npm install`
2. `.env.local` (não versionado) com `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `MASTER_PIN`.
3. Supabase: schema, RLS e publication Realtime. **Todos os scripts SQL já foram aplicados** neste projeto; para um projeto novo, ver `docs/schema.md` e os blocos de SQL em `PROJECT_STATUS.md` (inclui a tabela `notifications`, a policy de SELECT em `recipient_id` e a adição à publication `supabase_realtime`). Migrações não ficam no repo.

## Estrutura
```
src/
├─ app/            # rotas do App Router (+ grupo (auth): /login, /register)
├─ actions/        # Server Actions por domínio (auth, houses, tasks, rewards, notifications)
├─ components/     # ui/ · auth/ · dashboard/ · tasks/ · rewards/ · houses/ · notifications/
├─ hooks/          # use-postgres-changes · use-profile-points
├─ utils/          # house · notifications · media · task-sla · supabase/{server,client,admin,middleware}
├─ types/          # database · notifications
└─ proxy.ts        # proxy (substitui middleware no Next 16)
```

## Guias
- `AGENTS.md` — convenções e regras de negócio (obrigatório ler antes de codar)
- `PROJECT_STATUS.md` — estado do projeto / changelog (ler antes e atualizar ao terminar)
- `docs/schema.md` — snapshot do schema Supabase
- `docs/adr/` — decisões arquiteturais (o "porquê")

# CasaSync Web

Sistema de organização familiar: casas, tarefas com pontos e recompensas (gamificação), com login por username. Multi-tenant (Admin → Casas → Dependentes), isolamento por `house_id` via Supabase RLS.

## Stack
- Next.js 16 (App Router, `src/`) + React 19 + Tailwind 4 + shadcn/ui
- Supabase (Auth, Postgres, Realtime, Storage)

## Comandos
```bash
npm run dev        # dev server
npm run build      # build de produção (rode antes do dev p/ evitar conflito de .next)
npm run lint       # eslint
npm run typecheck  # npx tsc --noEmit
```

Sem testes configurados. Verificação antes de entregar: **lint → typecheck → build**.

## Setup
1. `npm install`
2. `.env.local` (não versionado) com `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `MASTER_PIN`.
3. Aplicar no dashboard do Supabase: schema (ver `docs/schema.md`), RLS e publication Realtime. Migrações SQL não ficam no repo.

## Guias
- `AGENTS.md` — convenções e regras de negócio (obrigatório ler)
- `PROJECT_STATUS.md` — estado do projeto / changelog
- `docs/schema.md` — snapshot do schema Supabase
- `docs/adr/` — decisões arquiteturais
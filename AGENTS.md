<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# CasaSync Web — Diretrizes do Agente

## Stack & Estrutura Base
- **CasaSync Web**: Gamificação familiar multi-tenant (Next.js 16 App Router em `src/`, React 19, Tailwind 4, shadcn/ui, Supabase).
- **Proteção de Rotas**: `src/proxy.ts` (substitui middleware). Lógica de sessão/role em `src/utils/supabase/middleware.ts`.
- **Configuração**: `next.config.ts` usa exportação híbrida (`module.exports` + `export default`). Não "corrigir".

## Diretrizes de Leitura do Agente (Just-In-Time)
1. **NÃO leia a pasta `docs/` inteira.** Consulte apenas o arquivo necessário para a tarefa atual:
   - Schema & Tipos DB: `src/types/database.ts` ou `docs/schema.md`.
   - Regras de Negócio e Features: `docs/business-rules.md`.
   - Arquitetura, Supabase & Proxy: `docs/architecture.md`.
   - Contexto da Sprint / Tarefas: `PROJECT_STATUS.md`.

## Comandos de Verificação & Validação
Rode estritamente nesta ordem antes de entregar qualquer código:
`npm run lint` → `npm run typecheck` → `npm run build`

> **Atenção:** 
> - `npm run lint` usa `--max-warnings 0`. Warnings `no-img-element` estão desativados intencionalmente (uso legítimo de `<img>` para Supabase Storage e ícones públicos).
> - Se a pasta `.next/` for apagada, rode `npm run build` ou `next dev` antes do `tsc`.

## Regra Inegociável de Escrita de Arquivos (Encoding)
- **NUNCA use PowerShell** (`Set-Content`, `Out-File`, `Add-Content`, `>`) para criar ou editar arquivos (causa corrupção de caracteres e BOM em UTF-8).
- Use **exclusivamente** as ferramentas de edição do CLI, `apply_patch` ou scripts em **Node.js** com `utf8`.
- Na dúvida, execute `npm run check:encoding` antes de commitar.

## Convenções Críticas de Código
- **Autenticação & Credenciais:**
  - Senha e `masterPin` **nunca** em `useState` ou inputs controlados (inputs usam `name` puro + `reset()` no submit).
  - Formulários de senha exigem `<Input suppressHydrationWarning>`.
  - Server Actions de credenciais **não podem lançar exceção**; use `try/catch` retornando `ActionResult { ok: false, error: '...' }`.
- **Service Worker (`public/sw.js`):**
  - Cache-first **somente** para `STATIC_ASSETS` e `/_next/static/`.
  - Qualquer outro GET same-origin (incluindo RSC e Realtime) vai **direto para a rede, sem cache**. Incremente `CACHE_NAME` ao alterar o SW.
- **Layout & Estilização:**
  - Shells usam `max-w-7xl`. Padding de página fica **apenas** na raiz da rota (`layout.tsx`), nunca repetido em subpáginas.
  - Não use variantes `2xl:` do Tailwind (use `min-[1536px]:`).
- **Git:** Commits curtos em português, apenas quando solicitado.
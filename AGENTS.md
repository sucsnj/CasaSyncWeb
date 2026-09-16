<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# CasaSync Web — Diretrizes do Projeto

## 1. Stack Tecnológica & Boas Práticas
- **Framework:** Next.js (App Router) com TypeScript (strict mode).
- **Backend & Banco de Dados:** Supabase (Auth, PostgreSQL com RLS, Realtime).
- **Estilização & UI:** Tailwind CSS + Shadcn UI.
- **Convenção de Supabase:**
  - Operações de servidor usam `utils/supabase/server.ts`.
  - Operações do cliente usam `utils/supabase/client.ts`.
  - NUNCA exponha ou use a `SUPABASE_SERVICE_ROLE_KEY` no client-side.
  - Toda tabela no banco deve ter Row Level Security (RLS) habilitado.

## 2. Regras de Negócio Críticas
- **Papeis de Usuário (`user_role`):**
  - `ADMIN`: Cria/gerencia casas, cria contas de dependentes, cria e atribui tarefas, aprova recompensas.
  - `DEPENDENT`: Apenas visualiza suas próprias tarefas, marca como concluídas e solicita resgate de recompensas. Não pode se cadastrar sozinho nem alterar dados da casa.
- **Hierarquia:** Administrador -> Casa(s) -> Dependente(s) -> Tarefas / Recompensas.
- **Multi-tenant:** Dados sempre isolados por `house_id` via RLS.

## 3. Protocolo de Leitura e Contexto
Antes de iniciar qualquer tarefa:
1. Leia este arquivo e o arquivo `PROJECT_STATUS.md`.
2. Consulte apenas os arquivos relevantes para a tarefa solicitada, sem ler o repositório inteiro.

## 4. Protocolo de Manutenção do Contexto (OBRIGATÓRIO)
Ao finalizar QUALQUER implementação ou refatoração:
1. Verifique se o código segue as diretrizes deste arquivo.
2. Atualize o arquivo `PROJECT_STATUS.md` informando:
   - Funcionalidades implementadas ou alteradas.
   - Novas tabelas, rotas ou componentes criados.
   - Pontos de atenção ou decisões arquiteturais tomadas.
   - O que deve ser feito na próxima etapa.

# NOTES

- Idioma de ensino: português (PT-BR). Código em TypeScript no estilo do projeto (alias `@/`, tipos `ActionResult`, validação em `actions/types.ts`).
- Usuário consultou `.skills/teach/SKILL.md`, mas a skill vive em `.agents/skills/teach/` (registrada em `skills-lock.json`). Manter isso em mente para sessões futuras.
- O projeto usa Next.js desta versão local (docs em `node_modules/next/dist/docs/`), Proxy (`proxy.ts`) em vez de middleware clássico, e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Padrões que o usuário já domina (evitar reensinar): fluxo de auth completo, criação de dependente por admin, redirecionamento por role no Proxy.
- Tópico da sessão 1: cliente SSR + RLS como defesa em camadas + Server Action segura de busca de tarefas.
- Pendência de evolução anotada (não ensinar em profundidade ainda): `getUser()` → `getClaims()` no Proxy.
- O usuário ainda não demonstrou domínio (não houve quiz/exercício) — sem learning records até lá.
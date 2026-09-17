# ADR-0002: Autenticação por username com e-mails sintéticos

**Status:** aceito · **Data:** histórico (Etapa de "Autenticação por PIN + Username", ver `PROJECT_STATUS.md`)

## Contexto
Sem e-mails reais (app doméstico, sem provedor SMTP). O login por Google foi removido por não fazer sentido sem e-mail.

## Decisão
- Contas usam e-mails sintéticos: `${username}@admin.casasync` (ADMIN) ou `${username}@dependente.casasync` (DEPENDENT), criadas via service role já com `email_confirm: true`.
- Cadastro de ADMIN validado por `masterPin` (`MASTER_PIN` env, checado em `actions/auth.ts`); DEPENDENT **nunca se cadastra sozinho** (criado por `createDependent` em `actions/houses.ts`).
- Login resolve username → e-mail sintético via `profiles` e chama `signInWithPassword` pelo cliente do servidor (Server Action em `src/actions/auth.ts`). Mensagem genérica "Credenciais inválidas." nos dois casos (não revela usernames existentes).
- `src/app/auth/callback/route.ts` ficou sem uso (resto do fluxo OAuth/magic link) — pode ser removido em etapa futura.

## Consequências
- `profiles.username` é obrigatório (única, lowercase, validada 3–24 chars `[a-z0-9._-]`).
- `validateCredentials`/`EMAIL_PATTERN` removidos de `actions/types.ts`; helpers `validateUsername`/`validatePassword` no lugar.
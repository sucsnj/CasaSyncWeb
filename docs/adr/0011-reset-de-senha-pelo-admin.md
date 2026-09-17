# ADR-0011: ADMIN redefine a senha de membros da casa (sem e-mail)

**Status:** aceito · **Data:** reset de senha pela interface

## Contexto
O app não usa e-mails reais (ADR-0002): contas são e-mails sintéticos
`${username}@admin.casasync` / `${username}@dependente.casasync`. Não há fluxo de
recuperação de senha por e-mail. Quando um dependente (ou co-ADMIN) esquece a
senha, o ADMIN da casa precisa poder redefini-la pela interface, sem depender do
dashboard do Supabase.

Decisões confirmadas com o usuário:
1. **Onde:** seguir as convenções do repo — action em `src/actions/houses.ts`
   (domínio de membros/casas) e UI em `src/components/houses/houses-manager.tsx`
   (a spec original citava `src/actions/members.ts` e uma rota `/members`, que
   não existem aqui).
2. **Feedback:** inline no modal (o app não tem lib de toast; consistente com os
   demais formulários).
3. **Senha mínima:** manter `>= 6` (`validatePassword`), igual ao cadastro/login.
4. **Escopo:** o ADMIN pode redefinir a senha de **qualquer membro** de uma casa
   que controla — dependentes E co-ADMINs (inclusive a própria).

## Decisão
- **`updateMemberPassword(targetUserId, newPassword)`** (`src/actions/houses.ts`):
  - Autorização derivada da sessão (`getSessionProfile` → exige `user_role='ADMIN'`).
  - Valida a senha com `validatePassword` (`>= 6`).
  - Busca as casas em que o ator é `house_members.role='ADMIN'` e confirma que o
    alvo é membro de **pelo menos uma** dessas casas antes de agir — o
    `targetUserId` nunca é confiado sem essa checagem (impede redefinir a senha
    de usuários de outras casas).
  - Chama `createAdminClient().auth.admin.updateUserById(targetUserId, { password })`
    (service role, server-only), dentro de `try/catch` — a action nunca lança
    (não expõe argumentos em overlay de dev, ADR-0003).
- **UI (`houses-manager.tsx`):** botão **"Senha"** (ícone `Key`) em cada membro da
  casa ativa abre um `Modal` com input **uncontrolled** (`name="newPassword"`,
  lido via `FormData` no submit) e feedback inline (erro `role="alert"` / sucesso
  `role="status"`). A senha nunca entra no estado React (ADR-0003).
- **Efeito:** `updateUserById` altera a senha **imediatamente**; o próximo login
  já usa a nova. A alteração NÃO revoga sessões ativas do alvo (comportamento
  padrão do Supabase) — aceitável no contexto familiar.

## Consequências
- ADMIN resolve senha esquecida sem dashboard/e-mail; mantém o padrão de
  autorização por membresia (ADR-0006).
- Sem envio de credencial por e-mail (o ADMIN comunica a nova senha à parte).
- A existência da capability exige cuidado: qualquer ADMIN membro pode redefinir
  a senha de outro co-ADMIN da mesma casa (assumido como desejado).
- Alternativa descartada: gerar link de recuperação via Supabase Auth — exigiria
  e-mail real, que o modelo de contas sintéticas não tem (ADR-0002).

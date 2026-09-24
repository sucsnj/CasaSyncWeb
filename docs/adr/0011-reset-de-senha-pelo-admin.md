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
4. **Escopo:** qualquer ADMIN redefine a **própria senha**; redefinir a senha de
   **outros** membros (dependentes E co-ADMINs) fica restrito ao **autor da casa**
   (`houses.owner_id`) — um co-ADMIN que entrou via PIN não altera a senha de
   ninguém além da própria (decisão confirmada após o co-controle por PIN).

## Decisão
- **`updateMemberPassword(targetUserId, newPassword)`** (`src/actions/houses.ts`):
  - Autorização derivada da sessão (`getSessionProfile` → exige `user_role='ADMIN'`).
  - Valida a senha com `validatePassword` (`>= 6`).
  - Busca as casas em que o ator é `house_members.role='ADMIN'` e confirma que o
    alvo é membro de **pelo menos uma** dessas casas antes de agir — o
    `targetUserId` nunca é confiado sem essa checagem (impede redefinir a senha
    de usuários de outras casas).
  - **Guard de autor:** quando o alvo **não é o próprio usuário**, exige que o
    ator seja o `owner_id` do `houses` daquele membro (a casa onde o alvo tem
    membresia). Co-ADMINs comuns caem no erro "Apenas o autor da casa pode
    alterar a senha de outros membros."
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
  autorização por membresia (ADR-0006), agora com o `owner_id` limitando quem
  altera a senha de terceiros.
- Sem envio de credencial por e-mail (o ADMIN comunica a nova senha à parte).
- A capability fica restrita ao autor: só o criador da casa redefine a senha de
  outro co-ADMIN/dependente; co-ADMINs compartilham a gestão da casa mas não
  alteram senhas alheias (mesma linha do ADR-0008/da distinção autor × co-gerente).
- Alternativa descartada: gerar link de recuperação via Supabase Auth — exigiria
  e-mail real, que o modelo de contas sintéticas não tem (ADR-0002).

# ADR-0012: ADMIN altera pontos de dependentes protegido pelo PIN da casa

**Status:** aceito · **Data:** alteração manual de pontuação

## Contexto
O saldo de pontos de um dependente só muda pelos fluxos naturais (aprovação de
tarefa, penalidade de `NOT_DELIVERED`, resgate aprovado). Não havia como o ADMIN
**corrigir** o acumulado manualmente (ex.: reposição de pontos, ajuste de erro do
fluxo). É a única forma hoje de *editar* `profiles.points` fora dessas regras.

Decisões com o usuário:
- A alteração é protegida pelo **próprio PIN da casa** (`houses.code`) — o mesmo
  código de convite exibido em "Suas casas" — em vez de uma env server-only.
  (Originalmente havia uma env `PIN_PTS`; a decisão foi revertida para agregar o
  "PIN de pontos" à casa: menos estado de configuração, um só PIN por casa.)
- O valor é um **SET absoluto** do acumulado (não um delta), podendo inclusive
  ser **negativo** (o banco aceita saldos negativos da penalidade — ADR-0007).
- Restrito a **dependentes** (membros `house_members.role='DEPENDENT'`) das casas
  que o ator controla como ADMIN — pontos de ADMIN não têm significado (são
  ocultados da UI).

## Decisão
- **`updateDependentPoints(dependentId, newPoints, pinPts)`** (`src/actions/houses.ts`):
  - Autorização derivada da sessão (`getSessionProfile` → exige `user_role='ADMIN'`), nunca do payload.
  - Confirma que o alvo é membro `DEPENDENT` de uma casa e que o ator é `ADMIN`
    dessa casa (mesmo padrão de `updateDependentProfile`/`updateMemberPassword`).
  - Compara o PIN digitado com o `houses.code` da casa do dependente,
    **normalizado como `joinHouseByPin`** (trim + uppercase) — fail closed: PIN
    ausente/incorreto nunca confere (formato é sempre o código gerado pela casa).
  - Escrita em `profiles.points` via **service role** (server-only) — o RLS do
    cliente autenticado não cobre a escrita cross-role.
- **UI (`houses-manager.tsx`):** pill âmbar "N pts" por dependente + botão
  **"Pontos"** (`Coins`) → `Modal` com o saldo atual, campo `newPoints`
  (number, uncontrolled) e campo `pinPts` (password, uncontrolled,
  `suppressHydrationWarning`), rotulado **"PIN da casa"**. Credencial lida via
  `FormData` no submit e descartada — **nunca** entra no estado React (ADR-0003).
- `router.refresh()` após sucesso atualiza a lista; o Realtime
  (`useProfilePoints` no lado do dependente) reflete o novo saldo ao vivo.

## Consequências
- O ADMIN consegue corrigir/ajustar saldo sem dashboard do Supabase, com o PIN da
  casa como segundo fator de conhecimento (quem controla a casa já o possui).
- Trocar o PIN da casa (ação de autor, `rotateHousePin`) também invalida o PIN de
  pontos — um só código, uma só superfície de confiança.
- Saldo pode ir a negativo voluntariamente (regra já existente) respeitando o
  limite inferior de `POINTS_MIN`.
- Alternativa descartada: delta (aditivo) — mais propenso a erro de "qual valor
  somar?" e confuso de validar.
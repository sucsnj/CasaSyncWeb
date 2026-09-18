# ADR-0012: ADMIN altera pontos de dependentes protegido por PIN_PTS

**Status:** aceito · **Data:** alteração manual de pontuação

## Contexto
O saldo de pontos de um dependente só muda pelos fluxos naturais (aprovação de
tarefa, penalidade de `NOT_DELIVERED`, resgate aprovado). Não havia como o ADMIN
**corrigir** o acumulado manualmente (ex.: reposição de pontos, ajuste de erro do
fluxo). É a única forma hoje de *editar* `profiles.points` fora dessas regras.

Decisões com o usuário:
- Nova env server-only **`PIN_PTS`**, exigida para a alteração — mesma mecânica
  do `MASTER_PIN` (validação por comparação de string; **fail closed** se a env
  não estiver configurada, pois `undefined` nunca confere).
- O valor é um **SET absoluto** do acumulado (não um delta), podendo inclusive
  ser **negativo** (o banco aceita saldos negativos da penalidade — ADR-0007).
- Restrito a **dependentes** (membros `house_members.role='DEPENDENT'`) das casas
  que o ator controla como ADMIN — pontos de ADMIN não têm significado (são
  ocultados da UI).

## Decisão
- **`updateDependentPoints(dependentId, newPoints, pinPts)`** (`src/actions/houses.ts`):
  - Autorização derivada da sessão (`getSessionProfile` → exige `user_role='ADMIN'`), nunca do payload.
  - Valida `pinPts === process.env.PIN_PTS` e `validatePoints` (inteiro entre
    `POINTS_MIN=-1.000.000` e `POINTS_MAX=1.000.000`), ambos em passo anterior a
    qualquer escrita.
  - Confirma que o alvo é membro `DEPENDENT` de uma casa e que o ator é `ADMIN`
    dessa casa (mesmo padrão de `updateDependentProfile`/`updateMemberPassword`).
  - Escrita em `profiles.points` via **service role** (server-only) — o RLS do
    cliente autenticado não cobre a escrita cross-role.
- **UI (`houses-manager.tsx`):** pill âmbar "N pts" por dependente + botão
  **"Pontos"** (`Coins`) → `Modal` com o saldo atual, campo `newPoints`
  (number, uncontrolled) e campo `pinPts` (password, uncontrolled,
  `suppressHydrationWarning`). Credencial lida via `FormData` no submit e
  descartada — **nunca** entra no estado React (ADR-0003).
- `router.refresh()` após sucesso atualiza a lista; o Realtime
  (`useProfilePoints` no lado do dependente) reflete o novo saldo ao vivo.

## Consequências
- O ADMIN consegue corrigir/ajustar saldo sem dashboard do Supabase, com um
  segundo fator de conhecimento (PIN_PTS) separado do `MASTER_PIN`.
- O PIN desaconselha que qualquer ADMIN membro pontue à vontade, mas quem possui
  a env ainda tem acesso total — é uma camada de proteção, não isolamento.
- Saldo pode ir a negativo voluntariamente (regra já existente) respeitando o
  limite inferior de `POINTS_MIN`.
- Alternativas descartadas: delta (aditivo) — mais propenso a erro de "qual
  valor somar?" e confuso de validar; permitir a co-ADMINs sem PIN — contraria o
  objetivo da feature.
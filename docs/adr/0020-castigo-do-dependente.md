# ADR-0020: Castigo do dependente — indicador no cabeçalho, sem efeito em regra nenhuma

**Status:** aceito — **Data:** 2026

## Contexto
O tutor Sometimes precisa marcar um dependente como "castigado" (aviso disciplina)
sem que isso cascateie em regra de negócio. O codebase já tem duas coisas
próximas, mas com outras finalidades, e **nenhuma delas serve** para isso:
- a **penalidade** (`PENALTY`, via `updateDependentPoints`) debita pontos e exige
  PIN da casa — efeito financeiro real, com notificação e fila de alerta;
- a tarefa **`NOT_DELIVERED`** (ADR-0007/0018) é estado do ciclo de tarefa, com
  penalidade definitiva em pontos.

Misturar as duas criaria conflito de semântica: o "castigo" não pode custar
pontos, não pode virar tarefa, não pode travar resgates e não pode virar
notificação (o dependente não precisa ser notificado — ele **precisa** é do
sinal visível de que o próprio tutor escreveu algo para ele).

## Decisão
1. **Novo módulo isolado `dependent_punishments` — só um indicador.** Não há
   escrita em `profiles.points`, `tasks`, `rewards` ou `dependent_achievements`.
   Nenhuma regra do app lê esta tabela: ela alimenta **apenas** o ícone de
   triângulo no cabeçalho do dependente. Essa é a garantia de que "castigo" não
   vira conseqüência não intencional.
2. **Um castigo ativo por dependente:** `unique (profile_id)`. Aplicar de novo
   **substitui** o anterior (upsert) em vez de acumular pilha de avisos. Um
   dependente tem, no máximo, uma coisa para ler.
3. **Descrição e duração são OPCIONAIS**, com semântica própria:
   - sem descrição → o dependente vê o aviso sem texto ("seu tutor não deixou
     uma descrição");
   - sem duração → **não expira**; sai só quando o ADMIN remove manualmente.
   Com duração (1–365 dias), `expires_at` = `now + N dias` é gravado pela action
   e a expiração é avaliada **na leitura** — não há cron no projeto (mesma
   premissa do decaimento de pontos e dos comunicados).
4. **Sem Realtime, por decisão de produto** (mesma premissa dos comunicados,
   ADR-0017): o castigo chega ao dependente no **render server-side** — ele o vê
   ao atualizar a página ou navegar, em todas as telas (`/dashboard/dependent`,
   `/tasks`, `/rewards`, `/achievements`). As actions chamam `revalidatePath`
   nessas rotas para que a próxima renderização já traga o dado novo, sem
   depender de nenhum evento ao vivo.
5. **Escopo sempre derivado da sessão:** `applyPunishment`/`removePunishment`
   recebem **apenas o `profile_id`** do alvo — a casa vem de `getActiveAdminHouse`
   (nunca de parâmetro público) e o alvo precisa ser `DEPENDENT` dessa casa. A
   leitura do dependente é `getActivePunishment(profileId, houseId)`, com escopo
   nos dois ids.
6. **Leitura com limpeza lazy:** `getActivePunishment` apaga o castigo vencido na
   próxima leitura (best-effort) e ainda assim trata `expires_at` no código, para
   que uma falha no delete nunca mostre aviso vencido.
7. **Autorização e visibilidade:** o botão **"Castigo"** só existe para linha
   `DEPENDENT`, e a action é do tipo "qualquer ADMIN da casa ativa" (a punição é
   disciplina de rotina, não um ato do autor da casa — diferente de excluir conta
   ou trocar o PIN, que seguem restritos ao autor, ADR-0014).

## Consequências
- **O castigo não é notificação** e por isso não gera `notifications`, push, nem
  entra na fila de alertas (`AlertQueueOverlay`). Ele é leitura, não evento.
- Se um dia ele precisar de "o tutor te aplicou um castigo agora", isso é
  notificação (canal `notifications`, com Realtime comprovado) — **não** é
  assinatura nesta tabela.
- Castigo **não expira sozinho se o ADMIN não definir duração** — é intencional
  (dá para manter um castigo aberto por toda a fase de um castigo), mas significa
  que a limpeza depende de ação humana.
- O botão "Castigo" fica em todas as linhas `DEPENDENT`, visível para qualquer
  ADMIN da casa (inclusive co-ADMIN), porque aplicação de castigo é de rotina.
- Como a leitura é por render, se o ADMIN aplicar o castigo enquanto o
  dependente está na tela, o triângulo só aparece depois que o dependente
  atualizar ou navegar — **limitação aceita e alinhada aos comunicados**.
- A remoção manual é idempotente (não haver castigo não é erro) e as limpezas de
  membro (`expelMember`, `deleteDependentAccount`) e de casa (`deleteHouse`)
  removem os castigos explicitamente, sem depender de cascade.
- O schema é o único requisito de infraestrutura e foi aplicado manualmente em
  `docs/sql/dependent_punishments.sql` (as migrações SQL não são versionadas no
  repo, por decisão de projeto). Feature testada ponta a ponta: botão "Castigo" →
  ícone no dependente → expiração/remoção.
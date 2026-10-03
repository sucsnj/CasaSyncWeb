# ADR-0019: Progresso de conquista trava no objetivo enquanto o resgate está pendente

**Status:** aceito · **Data:** 2026 (pós-ADR-0015/0016)

## Contexto
O progresso de uma conquista (`dependent_achievements.current_progress`) **não tinha teto**. Nos três caminhos de escrita ele continuava somando **depois** do desbloqueio:
- `evaluateAchievements` (`src/actions/stats.ts`) derivava do contador absoluto das métricas contadas: `contador − (nível−1) × objetivo`, que cresce sem limite enquanto o ciclo está aberto;
- `EARNED_POINTS` somava o valor creditado direto na linha;
- o ajuste manual do tutor (`adjustAchievementProgress`) somava `+1` sem limite.

Na prática, o dependente via um `12/5` no card, com a barra lotada há semanas — e o mesmo ciclo rendendo mais de uma vez no resgate seguinte.

O efeito mais grave era no ciclo seguinte: como o excedente ficava guardado, o rollover do resgate (`progress − target_count`) **represervava** a sobra, e o próximo evento re-derivava do contador absoluto — então um `12/5` rendia um segundo ciclo praticamente de graça. Ou seja: a pontuação contava mesmo sem resgate, o contrário do que a tela promete (o botão só existe quando há resgate pendente).

## Decisão
1. **O progresso de um ciclo vive entre `0` e `target_count`** — nunca passa do objetivo. Conquista desbloqueada e não resgatada fica **congelada em `N/N`**, e o excedente é **descartado**: o ciclo seguinte só volta a contar depois do resgate. (Escolha do usuário entre "descartar o excedente" e "preservar".)
2. **Dois helpers puros** em `src/utils/achievements.ts` concentram a regra, para que os três caminhos não voltem a divergir:
   - `capAchievementProgress(progress, target)` — teto no objetivo e piso em 0 (também usado na **exibição**, protegendo contra linhas gravadas antes da regra);
   - `applyAchievementProgress(current, target, amount)` — **soma trava no objetivo**; **subtração tem piso em 0 e continua valendo mesmo com a conquista desbloqueada**, porque é o que permite ao tutor **revogar** o desbloqueio (`−1` em `MANUAL`, decisão do usuário: a revisão do tutor permanece).
3. **Métrica repetível passou a ser incremental no valor gravado** (igual a `EARNED_POINTS` e `MANUAL`), e não mais derivada do contador absoluto. Era a única forma de descartar o excedente: com `contador − (nível−1) × objetivo` a sobra reaparece sozinha na próxima ocorrência. Só a **primeira** ocorrência da conquista usa o contador (histórico anterior conta, como nas únicas).
   - **Única segue derivada** do contador (`min(contador, objetivo)`) com o piso histórico `max(registrado, contador)`: meta de vida única deve contar todo o histórico, e o teto é a própria regra.
4. **O resgate zera o ciclo:** `claimAchievementReward` grava `current_progress = 0` (antes: `max(0, progress − target_count)`, que era o que carregava o excedente). O update otimista do card do dependente foi junto.
5. **UI:** o card do dependente mostra `N / N` com ícone de cadeado e "travado até resgatar" enquanto houver resgate pendente; o `N/N` e a barra usam o teto (linhas legadas não exibem mais `12/5`). No ADMIN, o `+1` de uma conquista `MANUAL` **desliga** em `N/N` e o contador exibido também é limitado.

## Consequências
- **Cada ciclo de uma repetível custa o objetivo inteiro de novo** depois do resgate: não existe mais "ciclo acumulado" por um período de tarefas forte em casa.
- O contador em `dependent_stats` continua contando normalmente (não zera): ele alimenta as **únicas** e é a métrica bruta da casa. Só o progresso do ciclo é travado.
- **Perde-se a recuperação automática** do modelo derivado: se a gravação do progresso falhar (`syncAchievementProgress` é best-effort), aquele evento não volta na próxima ocorrência — é o mesmo comportamento que `EARNED_POINTS`/`MANUAL` já tinham. Em compensação, a escrita continua com guard `.eq('current_progress', valor lido)` + 1 retry relendo, então concorrência não perde incremento.
- **Sem mudança de schema.** As linhas que já estavam gravadas acima do objetivo foram limpas com `docs/sql/achievement_progress_cap.sql` (UPDATE que limita cada linha à `target_count` da conquista); o app também se autocorrige na próxima ocorrência da métrica.
- Conquistas **secretas** seguem revelando só no desbloqueio delas — a trava não mexe nisso.
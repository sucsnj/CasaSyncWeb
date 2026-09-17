# ADR-0010: Realtime exige `setAuth` da sessão antes de assinar

**Status:** aceito · **Data:** correção do Realtime das notificações

## Contexto
Depois de aplicar a tabela `notifications` e a policy de SELECT (`recipient_id = auth.uid()`), as notificações **só apareciam após recarregar a página**. O canal do Realtime reportava `SUBSCRIBED`, mas **nenhum evento chegava** — sem erro, sem `CHANNEL_ERROR`, sem log.

Diagnóstico por probes (executados no browser, depois removidos):
- Sessão obtida via `signInWithPassword` (token já em memória) → **recebia** os eventos.
- Mesma consulta com a sessão **restaurada do storage/cookies** (`@supabase/ssr`) → **0 eventos**, ainda que `SUBSCRIBED`.
- `await getSession()` + `await realtime.setAuth(access_token)` **antes** de assinar → **evento recebido**.

Causa raiz: quando a sessão vem de cookies (caso normal do app), `auth.getSession()` é assíncrono e o socket Realtime conectava **como `anon`** antes de o token estar disponível. Como o RLS compara `auth.uid()`, o evento era descartado em silêncio no servidor.

## Decisão
- O hook `usePostgresChanges` (`src/hooks/use-postgres-changes.ts`) passa a fazer, **antes** de criar/assinar o canal:
  1. `const { data } = await getSession()` (cliente browser);
  2. `await realtime.setAuth(data.session.access_token)`.
- O efeito virou assíncrono com uma guarda `cancelled` no cleanup (o subscribe pendente é cancelado se o componente desmontar antes de assinar).
- Como **todos** os listeners do app usam esse hook, a correção vale de uma vez para tarefas, recompensas, resgates, sugestões, saldo e notificações.

## Consequências
- Realtime volta a funcionar para qualquer sessão (storage ou memória) — condição obrigatória para o sino e para todas as telas ao vivo.
- **Não remover** o `setAuth` ao refatorar o hook: sem ele, o app "parece" funcionar (o canal conecta) mas entrega zero eventos, um modo de falha difícil de detectar.
- A RLS continua sendo o backstop de isolamento (o browser nunca usa service role), então a correção **não** relaxa segurança — apenas autentica corretamente o socket.
- Alternativa descartada: passar a sessão por parâmetro/props para o hook — mais frágil e não cobre os demais listeners.

# CasaSync Web — PROJECT STATUS

> **Banco de dados sincronizado:** **todos** os scripts/enums SQL citados neste documento — coluna `profiles.username`, colunas `image_url` (incluindo `rewards.active` da desativação de recompensa e `notifications.image_url`/`message_id` da mensagem rápida, **todas já aplicadas**), tabela `reward_suggestions`, flags `extension_*`, enum `task_status` com `NOT_DELIVERED`, tabela `notifications`, policies de leitura, publication Realtime **e o bucket público `casasync-media`** (cujo upload de imagens funciona em avatares/casas/recompensas/tarefas/sugestões **e na pastinha da compositor**) **já foram aplicados** no Supabase. Os blocos de SQL abaixo são **registro histórico** do que foi rodado — o mesmo vale para as seções "Próxima etapa" / "Pontos de atenção" mais antigas (nada está pendente no banco).

## Transições entre rotas mais ágeis (concluída — sem mudança de schema)

### Diagnóstico (lentidão era acúmulo de round-trips, não um endpoint específico)
- Todas as páginas são `dynamic = 'force-dynamic'` → cada navegação é um render dinâmico novo, sem cache.
- Cadeia serial por navegação ADMIN (`/tasks`): proxy (`getUser()` + select `profiles.user_role`) → página (`getSessionProfile` = `getUser()` + select `profiles`) → `getMyNotifications` (DELETE de limpeza lazy + SELECT) → `getActiveAdminHouse` (**chamava `getSessionProfile` de novo** + listagem de casas) → tarefas + assignees. **~12 chamadas HTTP em série** (amplificado por acesso em rede local/outro dispositivo).
- Sem `loading.tsx`/`Suspense` em nenhum segmento → durante a navegação dinâmica não havia feedback; `/tasks` e `/rewards` renderizam o próprio shell (nav/sino + canal Realtime remontando a cada transição).

### O que foi feito (conjunto "menos dramático": A1 + A3 + B6)
- **A1 — `React.cache` (memoização por request) em `src/utils/house.ts`:** `getSessionProfile` (elimina o `getUser()`+`profiles` duplicado que `getActiveAdminHouse` disparava no mesmo request; layouts e páginas do dashboard compartilham uma única chamada) e `getAdminHouses` (a consulta interna de `getActiveAdminHouse` e a da página `/dashboard/admin/houses` viram uma só). Sem mudança de assinatura.
- **A3 — `Promise.all` nas páginas:** `tasks`/`rewards` buscam notificações + casa (ativa p/ ADMIN, do dependente) em paralelo e usam referências comuns; admin de `tasks` paraleliza tarefas + assignees; `/dashboard/admin/houses` paraleliza casa ativa + casas; `/dashboard/admin` paraleliza sessão + casa ativa.
- **B6 — telas de loading amigáveis:** novo `PageSkeleton` (`src/components/ui/page-skeleton.tsx`, placeholders `animate-pulse` no visual do app — hero, header fixo opcional e grid de cards) + `loading.tsx` em `tasks/`, `rewards/`, `dashboard/admin/`, `dashboard/dependent/` e `dashboard/admin/houses/`. Feedback instantâneo na transição.

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npm run build` ✓ (rotas idênticas, `ƒ Proxy` ativo) · `npm run typecheck` ✓.

### Próximo passo (não feito — maior esforço/risco)
- Proxy `getUser()` → `getClaims()` (+ role num claim do JWT, se quisermos zerar o round-trip do proxy); layout compartilhado para o shell do dashboard (evita remount do nav/sino/Realtime entre `/*`, `/tasks` e `/rewards`); `unstable_cache`/Cache Components para navegação "instantânea" de verdade; Condição de execução da limpeza lazy de notificações (hoje roda um DELETE a cada render).

## Refresco de documentação e contexto (concluída)

### O que foi feito
- **Docs sincronizadas com o banco (nada pendente):** `AGENTS.md`, `README.md` e `docs/schema.md` deixaram de marcar `rewards.active`, `notifications.image_url`/`message_id` e o bucket/pasta `messages` como "a aplicar/pendente" — tudo **já aplicado** no Supabase (confirmado; os blocos de SQL em `PROJECT_STATUS.md` seguem como **registro histórico**). `docs/schema.md` perdeu as caixas "A aplicar" e documenta `notifications.type` como `text` **sem CHECK** no banco.
- **Removido `src/app/auth/callback/route.ts`:** sem uso desde que o login com Google foi removido (nada o referenciava; `src/app/auth/` deixou de existir).
- **Contagem de notificações corrigida:** são **17** tipos em `src/types/notifications.ts` (o `QUICK_MESSAGE` foi adicionado; antes constava 16).
- **Types seguem espelho manual atualizado** (`src/types/database.ts` já contém `rewards.active` e `notifications.image_url`/`message_id`) — mantido sem regeneração via CLI.
- **Evolução futura anotada (não feita):** migrar `supabase.auth.getUser()` → `getClaims()` no `updateSession` (docs atuais do Supabase preferem `getClaims()` no proxy — validar assinatura do JWT a cada request).
- Material de ensino (skill `teach`) mantido como está.

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npx tsc --noEmit` ✓ · `npm run build` ✓ (12 workers, `ƒ Proxy` ativo).

---

## Bug de fuso em prazos de tarefas — data/hora com 3h de diferença (corrigido)

### Causa raiz (investigação)
- O `<input type="datetime-local">` produz um valor **sem fuso** (`YYYY-MM-DDTHH:mm` — hora de parede local do usuário; America/Recife = UTC-3). O formulário enviava essa string **naive** direto ao banco (`createTask`/`updateTask` → coluna `tasks.due_date`, `timestamptz`). O Postgres interpreta string sem fuso na **timezone da sessão do servidor (Supabase: UTC)** → um prazo digitado 14:30 virava o instante `14:30Z` = **11:30 em Recife** (3 horas adiantado).
- Por que "nem sempre": no salvamento de edição (`saveDueDate`) o card otimista usava `new Date(value).toISOString()` **no browser** (instante correto), mas enviava a string naive crua ao servidor — o card mostrava certo até o refresh/Realtime, aí o valor deslocado aparecia.

### O que foi feito
- **Novo helper `src/utils/datetime-local.ts`:** `datetimeLocalToIso` converte o valor naive do `datetime-local` para o **instante UTC correto no fuso do cliente** (`new Date(naive)` no browser = hora local por especificação do ECMAScript; `typeof window` trava para nunca rodar no servidor). Os formatadores que viviam em `tasks-admin.tsx` foram para lá (`isoToDateTimeLocalValue`, `nowDateTimeLocalValue`, `modifyDateTimeLocal`).
- **Cliente converte antes de enviar** (`src/components/tasks/tasks-admin.tsx`): criação (`handleCreate`) e edição de prazo (`saveDueDate`) passam por `datetimeLocalToIso`, e o otimista usa o mesmo instante — sem `new Date().toISOString()` solto no submit.
- **Guarda server-side** (`normalizeDueDate` em `src/actions/tasks.ts`): `createTask` e `updateTask` **rejeitam prazo sem fuso** (fail-closed) — uma naive que voltar a chegar vira erro visível em vez de re-gravar data errada.
- **Exibição local só no cliente:** novo `FormattedDateTime` (`src/components/ui/formatted-date.tsx`, via `useSyncExternalStore`). Nos cards sempre renderizados (dependente/rewards) um `toLocaleString('pt-BR')` no SSR (Vercel/Netlify giram em UTC) produzia hora de parede UTC no HTML e o cliente re-hidratava em hora local — hydration mismatch + flash. O componente renderiza um placeholder estável até a hidratação e então formata no fuso do dispositivo.
- **Prazos gerados pelo servidor** (`restoreTask`, `resolveTaskExtension`, auto-aceite do `updateTask`, `markTaskNotDelivered`) já usavam `.toISOString()`/instantes — corretos; não mudaram.
- **Sem mudança de schema:** `tasks.due_date` continua `timestamptz`. Sem lib nova de datas (decisão: especificação do ECMAScript + trava de ambiente cobrem o caso sem dependência).

### SQL opcional — corrigir tarefas JÁ criadas (manual, revertível, não destrói dados)
Tarefas existentes criadas/editadas pelo input carregam o instante 3h adiantado. Correção **já aplicada** (09/2026, com backup revertível — nada quebra se pular; rodar no dashboard do Supabase na ordem):
```sql
-- 1) Backup (revertível): guarda o estado atual de TODO o `due_date`.
create table if not exists tasks_due_date_backup as
  select id, due_date from tasks;

-- 2) Corrige +3h SÓ nas tarefas "digitadas" pelo usuário.
--    Datas de `datetime-local` têm precisão de minuto (segundos = 0), então
--    `due_date = date_trunc('minute', due_date)` seleciona exatamente essas;
--    prazos gerados pelo servidor (restore/adiamento) guardam segundos+
--    milissegundos e ficam intactos. Ajuste o intervalo se o fuso não for -03.
update tasks
set due_date = due_date + interval '3 hours'
where due_date is not null
  and due_date = date_trunc('minute', due_date);

-- 3) Rollback (restaura tudo como estava):
update tasks t
set due_date = b.due_date
from tasks_due_date_backup b
where t.id = b.id;
```

*O backup (`tasks_due_date_backup`) permanece no banco; com ele, o rollback continua disponível a qualquer momento. Decisão completa (contrato "todo `due_date` com fuso", SQL de reparo só faz sentido no offset de digitação) em **ADR-0013** (`docs/adr/0013-prazos-de-tarefa-com-fuso-horario.md`).*

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npx tsc --noEmit` ✓ · `npm run build` ✓ (12 workers, `ƒ Proxy` ativo).

---

## Mensagem rápida DEPENDENT → ADMIN (implementada — SQL aplicado)

### O que foi implementado
- **Compositor no sino do DEPENDENT** (`src/components/notifications/quick-message-composer.tsx`, renderizado em `notifications-bell.tsx` quando `canSend`): **colapsável** — o cabeçalho (ícone violeta + "Mensagem rápida" + chevron girando) abre/fecha o compositor, que **inicia recolhido** (`open` default `false`). Texto **opcional** de até **100 caracteres** (contador) + **1 imagem** por mensagem (até **5 MB**, só `image/*`), escolhida da **Galeria** (input `accept="image/*"`) ou da **Câmera** — câmera **ao vivo real** em qualquer dispositivo via `getUserMedia` (`facingMode: 'environment'`, fallback para a webcam e para o seletor de arquivos quando a câmera está indisponível); preview com remover; upload via `uploadMedia('messages', user.id)` (nova pasta `messages` em `casasync-media`).
- **Server Action `sendQuickMessage(text, imageUrl?)`** (`src/actions/notifications.ts`): só **DEPENDENT** (papel derivado da sessão); valida `≤ 50` caracteres, exige texto OU imagem, e que a imagem seja URL pública do bucket (defesa server-side); checa **capacidade** — o dependente envia apenas se não tiver **mais de 2 mensagens próprias acumuladas** (lidas ou não); insere **1 cópia por ADMIN da casa** (mesmo `message_id`, título "Mensagem de {nome}", `image_url`) **+ 1 cópia para o próprio dependente** como **comprovante já lido** (título "Mensagem enviada", `read_at` preenchido — chega no sino dele como notificação **simples, sem possibilidade de edição**; não conta como não-lida nem para a retenção). Realtime entrega aos sinos dos ADMINs (e ao do próprio dependente).
- **Visualização com leitura automática:** o card da `QUICK_MESSAGE` é **colapsável** — tocar no cabeçalho expande (texto completo + imagem em tamanho real, chevron girando) e **marca como lida imediatamente**; **todos iniciam recolhidos** por padrão (`expandedQuickIds: Set<string>`); na lista o card recolhido mostra o texto e um thumbnail quando há imagem.
- **Retenção ("2 lidas → apaga a mais antiga"):** `cleanupQuickMessages` em `src/utils/notifications.ts`, disparado em `markNotificationRead` e `markAllNotificationsRead`. A mensagem é considerada **lida** quando **qualquer cópia de destinatário** (ex.: qualquer ADMIN) foi aberta — **a cópia do próprio remetente é ignorada na contagem** (é só comprovante); ao atingir **2 lidas**, apaga o grupo mais antigo (todas as cópias pelo `message_id`, incluindo a do dependente, + remoção da imagem no storage, best-effort). Conta **MENSAGENS distintas**, não cópias por destinatário (casa com 2 ADMINS = 1 mensagem).
- **Notificações comuns** (`tasks`/`rewards`/`sugestões`) ganharam passthrough de `image_url`/`message_id` em `notifyUser`/`notifyHouse` (sem uso atual) — o campo existe no banco e fica disponível para eventos futuros com imagem.

### SQL aplicado no Supabase
```sql
-- O bucket publico `casasync-media` NAO existia (upload falhava com "Bucket not
-- found" em todas as pastas). Criar + liberar select publico e insert de upload
-- para autenticados:
insert into storage.buckets (id, name, public)
values ('casasync-media', 'casasync-media', true)
on conflict (id) do update set public = true;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'casasync_media_select_public') then
    create policy "casasync_media_select_public" on storage.objects
      for select to public using (bucket_id = 'casasync-media');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'casasync_media_insert_authenticated') then
    create policy "casasync_media_insert_authenticated" on storage.objects
      for insert to authenticated with check (bucket_id = 'casasync-media');
  end if;
end $$;

-- Colunas de mensagem rapida:
alter table public.notifications add column if not exists image_url text;
alter table public.notifications add column if not exists message_id uuid;
create index if not exists notifications_message_idx on public.notifications (message_id);
-- SE existir CHECK constraint no `notifications.type`, incluir 'QUICK_MESSAGE'
-- no conjunto de valores permitidos (ou recriar a constraint com o valor novo).
```

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npx tsc --noEmit` ✓ · `npm run build` ✓ (12 workers, `ƒ Proxy` ativo).

### Decisões
- Mensagem rápida é **notificação** (destinatário = ADMINs, o "outro lado"), então reutiliza `notifications` com `type='QUICK_MESSAGE'` + `message_id` para agrupar as cópias de um mesmo envio — sem tabela nova, sem policy/Realtime novos (já na publication).
- Texto é opcional se houver imagem; `body` pode ficar vazio (o título identifica o remetente e o visualizador mostra a imagem).
- Armazenamento fiel à escolha do usuário: limite **conta mensagens** e a limpeza acontece **no ato de marcar lida** (regra "2 lidas → apaga a mais antiga"), removendo também a imagem do storage para não inflar o bucket.
- Câmera **ao vivo** (getUserMedia) no desktop e celular com fallback para seletor — atende "origem da imagem direto do dispositivo e pela câmera", independente de plataforma.

---

## Upload de imagem em TAREFAS desabilitado (concluída — sem mudança de schema)

### O que foi feito
- **UI de upload de tarefas removida (comentada):** em `src/components/tasks/tasks-admin.tsx` o `ImageUpload` do form de tarefas (import, estado `taskImageUrl`, bloco JSX e `input hidden image_url`) está **comentado** com a explicação inline — o envio foi desligado para **não inflar o storage/banco**. Sem o campo, `formData.get('image_url')` volta `null` e a tarefa nova nasce sem imagem.
- **Sem mudança no banco:** a coluna `tasks.image_url` e as actions `createTask`/`updateTask` **continuam intactas** — imagens de tarefas **antigas** seguem exibidas nos cards (ADMIN e DEPENDENT, com comentário nos pontos de exibição).
- **Reativação:** basta descomentar import/estado/bloco — nenhuma migração necessária.

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npx tsc --noEmit` ✓ · `npm run build` ✓ (12 workers, `ƒ Proxy` ativo).

---

## Desativação de recompensa pelo ADMIN (implementada — SQL `rewards.active` aplicado)

### O que foi implementado
- **Nova coluna `rewards.active`** (`boolean not null default true`): recompensa ativa por padrão; `false` = desativada (indisponível), **nunca excluída**. Só o ADMIN alterna — o dependente nunca reativa.
- **Server Action `setRewardActive(rewardId, active)`** (`src/actions/rewards.ts`): só ADMIN da casa (`assertAdminCanManage`); confirma que a recompensa pertence à casa ativa (`house_id`) antes de alternar `active`; revalida `/rewards`. Não há notificação associada (ação administrativa de gestão da loja).
- **`requestRedemption` guardado:** a consulta passa a incluir `active` e, com `active = false`, retorna `"Recompensa indisponível no momento."` — defesa no servidor, não depende só da UI.
- **UI ADMIN (`rewards-admin.tsx`):** no catálogo cada recompensa ganhou o botão **Desativar**/**Reativar** (ao lado de Editar); quando inativa, o card fica com fundo `slate-50`/borda `slate-300`, a imagem dessaturada e um chip rosa **"Inativa"**. Atualização otimista + `router.refresh()`.
- **UI DEPENDENTE (`rewards-dependent.tsx`):** recompensa desativada aparece acinzentada (borda/fundo `slate-300/50`, imagem em grayscale, título `slate-500`) com **"Indisponível"** no lugar do status de saldo; o botão "Resgatar" vira "Indisponível" e fica desabilitado. Reativação do ADMIN volta tudo ao normal automaticamente (Realtime).
- **Realtime:** `rewards` já está na publication — o cambio de `active` chega nos listeners sem alteração de publication/RLS.

### SQL aplicado no Supabase
```sql
alter table public.rewards add column if not exists active boolean not null default true;
```

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npx tsc --noEmit` ✓ · `npm run build` ✓ (12 workers, `ƒ Proxy` ativo).

### Decisões
- Desativar **não** apaga nem cancela resgates já aprovados/pendentes — afeta apenas novos pedidos (o guard bloqueia `requestRedemption`).
- Sem novo enum/status: ser ativa ou não é um atributo da recompensa, não do catálogo; a coluna tem default `true` para que as recompensas existentes nasçam ativas.

---

## Alteração de pontos de dependente pelo ADMIN via PIN_PTS (concluída)

### O que foi implementado
- **Nova env server-only `PIN_PTS`** (`.env.local`): senha exigida para o ADMIN alterar o saldo de pontos de um dependente — mesma mecânica do `MASTER_PIN` (fail closed se a env não estiver configurada).
- **Server Action `updateDependentPoints(dependentId, newPoints, pinPts)`** (`src/actions/houses.ts`): exige sessão ADMIN; valida `pinPts === process.env.PIN_PTS`, `validatePoints` (inteiro entre `POINTS_MIN = -1.000.000` e `POINTS_MAX = 1.000.000`, em `actions/types.ts`) e que o alvo é `DEPENDENT` de uma casa que o ator controla como ADMIN. Escrita em `profiles.points` via service role — **SET absoluto**, pode ser negativo. Revalida casas/tarefas/recompensas/dashboard.
- **UI (`houses-manager.tsx`):** pill âmbar **"N pts"** junto da role de cada dependente + botão **"Pontos"** (`Coins`) abre `Modal` "Alterar pontos — {nome}" com o saldo atual, input `newPoints` (number, **uncontrolled**) e o input `pinPts` (password, **uncontrolled**, `suppressHydrationWarning` — credencial nunca vai ao estado React, ADR-0003). Feedback **inline** (erro `role="alert"` / sucesso `role="status"`) + `router.refresh()` para a lista e o saldo mostrarem o novo valor (Realtime/`useProfilePoints` no lado do dependente também).

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npx tsc --noEmit` ✓ · `npm run build` ✓ (12 workers, `ƒ Proxy` ativo).

### Decisões
- VALOR = SET absoluto do acumulado (não delta) e restrito aos `DEPENDENT` da casa — pontos de ADMIN continuam sem significado na UI.
- PIN exigido porque essa é a única forma de *editar* o saldo manualmente (fora do fluxo tarefas/recompensas); sem PIN, qualquer ADMIN membro poderia pontuar à vontade.
- Detalhamento do "porquê" no **ADR-0012** (`docs/adr/0012-alteracao-de-pontos-pelo-admin-com-pin.md`).

---

## Pontos do ADMIN removidos da UI (concluída)

### O que foi implementado
- **ADMIN não acumula pontos**, então o saldo exibido para ele era ruído: o `DashboardNav` só recebe `points` no papel **DEPENDENT**. Removido `points={profile?.points}` do layout admin e, em `/tasks` e `/rewards` (role-aware), agora `points={isAdmin ? undefined : profile.points}`.
- **Efeito:** some o badge "N pts" do cabeçalho e a linha de pontos do `Modal` "Sua conta" para ADMIN; dependentes seguem iguais. O `DashboardNav` já renderiza esses blocos só quando `points` é número.
- **Nada mais alterado:** custos de recompensa, saldo do dependente e o resgate continuam como antes.

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npx tsc --noEmit` ✓ · `npm run build` ✓ (12 workers, `ƒ Proxy` ativo).

---

## "Sair" acessível em qualquer tela (concluída)

### O que foi implementado
- **Avatar do cabeçalho virou botão de conta:** em `dashboard-nav.tsx` o avatar (inicial) passou a ser um `<button>` que abre um `Modal` **"Sua conta"** (avatar + nome + pontos + `SignOutButton` em largura total). Antes, o "Sair" do cabeçalho era `hidden md:block` e o slot extra da bottom nav só existia com `items.length < 4` — logo, o **ADMIN no mobile (4 itens)** não tinha como sair.
- **Sem regressão:** o "Sair" do desktop (cabeçalho, `md:block`) e o slot extra da bottom nav (dependentes, 3 itens) continuam; a conta no avatar apenas garante a ação em **qualquer largura**.

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npx tsc --noEmit` ✓ · `npm run build` ✓ (12 workers, `ƒ Proxy` ativo).

---

## Reset de senha de membros pelo ADMIN (concluída)

### O que foi implementado
- **Server Action `updateMemberPassword(targetUserId, newPassword)`** (`src/actions/houses.ts`, junto do domínio de membros/casas): o ADMIN redefine a senha de qualquer membro de uma casa que controla — dependentes E co-ADMINs — usando `createAdminClient().auth.admin.updateUserById(...)` (service role, **sem e-mail de recuperação**).
- **Autorização derivada da sessão:** exige `user_role='ADMIN'`; busca as casas em que o ator é `house_members.role='ADMIN'` e confirma que o alvo é membro de pelo menos uma delas **antes** de agir (o `targetUserId` do cliente nunca é confiado). Action nunca lança (`try/catch` → `ActionResult`).
- **Validação:** reutiliza `validatePassword` (**>= 6**), igual ao cadastro/login.
- **UI (`houses-manager.tsx`):** botão **"Senha"** (ícone `Key`) em cada membro abre um `Modal` com input de senha **uncontrolled** (`name="newPassword"`, lido via `FormData` no submit — ADR-0003) e feedback **inline** (erro `role="alert"` / sucesso `role="status"`); a linha de membros passou a `flex-wrap` para não espremer em telas estreitas.
- **Efeito:** a senha muda imediatamente; o próximo login já usa a nova. Sessões ativas do alvo **não** são revogadas (comportamento padrão do Supabase).

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npx tsc --noEmit` ✓ · `npm run build` ✓ (12 workers, `ƒ Proxy` ativo).

### Decisões
- Implementado seguindo as convenções do repo (a spec original citava `src/actions/members.ts` e uma rota `/members`, que não existem): action em `houses.ts`, UI em `houses-manager.tsx`.
- Feedback inline em vez de toast (o app não tem lib de toast).
- Detalhamento do "porquê" no **ADR-0011** (`docs/adr/0011-reset-de-senha-pelo-admin.md`).

---

## Responsivo dos cards de tarefas (concluída)

### O que foi implementado
- **Nome da tarefa na linha superior, chips/botões abaixo (mobile):** nos cards de tarefas (ADMIN e DEPENDENTE) os `chips` (SLA/status), `pill` de pontos, chevron e botões de ação espremiam o título em telas estreitas. Agora o **título ocupa a linha de cima** e os elementos ficam numa **linha abaixo**, voltando ao layout lado a lado em `sm:`.
- **`tasks-admin.tsx`:** pendentes — o cabeçalho colapsável virou `flex-wrap` com o título `basis-full sm:basis-0 sm:flex-1` (chips + pontos + chevron caem para a linha seguinte no mobile); concluídas/aprovadas — o container virou `flex-col sm:flex-row`, com o título/chevron no topo e o grupo `chip + botões` (Desaprovar/Aprovar, Restaurar) abaixo.
- **`tasks-dependent.tsx`:** título e descrição vêm antes dos chips; SLA/status/pontos/prazo/adiamento foram reunidos numa única linha `flex-wrap` abaixo do texto.

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npx tsc --noEmit` ✓ · `npm run build` ✓.

---

## Notificações entre ADMIN e dependente (sino no cabeçalho) — concluída

### O que foi implementado
- **Tabela `notifications`** (1 linha por destinatário): `house_id`, `recipient_id`, `actor_id` (nullable), `type`, `title`, `body`, `link` (nullable), `read_at` (nullable; `null` = não lida), `created_at`.
- **Registro best-effort** (`src/utils/notifications.ts`): `notifyUser` (um destinatário) e `notifyHouse` (resolve todos os ADMINs ou todos os DEPENDENTEs da casa e exclui quem agiu). Falha ao gravar **nunca** derruba a ação principal (crédito/débito de pontos, aprovações etc.).
- **Destinatário = "o outro lado" da ação:** o dependente recebe tudo que os ADMINs fazem nas tarefas/resgates/sugestões dele; **todos os ADMINs membros** recebem tudo que o dependente faz. Quem agiu não recebe a própria ação.
- **Eventos cobertos:** criação/conclusão/aprovação/devolução/restauração de tarefa, `NOT_DELIVERED`, pedido e resolução de adiamento, criação de recompensa, pedido e resolução de resgate, criação e resolução de sugestão — integrados nas actions existentes de `src/actions/tasks.ts` e `src/actions/rewards.ts` (17 tipos em `src/types/notifications.ts`).
- **Gerenciamento** (`src/actions/notifications.ts`): `markNotificationRead`, `markAllNotificationsRead`, `deleteNotification`, `deleteAllNotifications`, `purgeReadNotifications` — escopo sempre `recipient_id = user.id` (derivado da sessão; service-role).
- **Retenção:** lidas apagadas após **5 dias** por limpeza lazy em `getMyNotifications` (sem `pg_cron`); `READ_RETENTION_DAYS` em `src/utils/notifications.ts`.
- **UI:** `NotificationsBell` (`src/components/notifications/notifications-bell.tsx`) no cabeçalho (`src/components/dashboard/dashboard-nav.tsx`), ao lado do avatar/pontos: badge de não lidas, painel em `Modal`, "marcar todas", "apagar todas" e apagar individual; clique marca lida e abre o `link` (`/tasks`/`/rewards`).
- **Realtime:** a tabela entra na publication `supabase_realtime`; o browser assina `recipient_id=eq.<userId>` e o RLS de SELECT (`recipient_id = auth.uid()`) garante que só as próprias notificações cheguem.
- **Dados iniciais:** carregados no servidor por `getMyNotifications(user.id)` nos layouts admin/dependent e nas páginas `/tasks` e `/rewards`, passados ao `DashboardNav` (`userId` + `notifications`).

### SQL aplicado no Supabase (registro)
```sql
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  type text not null,
  title text not null,
  body text not null,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_recipient_created_idx
  on public.notifications (recipient_id, created_at desc);

alter table public.notifications enable row level security;

create policy "notifications_select_own" on public.notifications
  for select to authenticated
  using (recipient_id = auth.uid());

alter publication supabase_realtime add table public.notifications;
```

### Bug corrigido — Realtime não chegava sem F5 (`usePostgresChanges`)

**Sintoma:** o sino/notificações só apareciam após recarregar a página. O canal retornava `SUBSCRIBED`, mas nenhum evento chegava.

**Causa raiz (confirmada empiricamente):** quando a sessão é **restaurada do storage/cookies** (caso do browser, via `@supabase/ssr`), o `auth.getSession()` é assíncrono e o socket Realtime conectava **como `anon`** antes do token estar disponível. Como o RLS da tabela usa `auth.uid()`, o evento era descartado em silêncio — sem erro, sem `CHANNEL_ERROR`. Diagnóstico: um probe com `signInWithPassword` (token já em memória) recebia os eventos; o mesmo probe com a sessão vinda do storage **não** recebia. Um segundo probe provou que `await getSession()` + `await realtime.setAuth(token)` **antes** de assinar resolve (`events:1`).

**Fix (`src/hooks/use-postgres-changes.ts`):** o efeito virou assíncrono — antes de criar/assinar o canal, faz `getSession()` e `realtime.setAuth(session.access_token)`. Como todos os listeners usam esse hook, a correção vale para **tarefas, recompensas, resgates, sugestões e notificações** (o Realtime do app estava sujeito ao mesmo problema). Cleanup continua cancelando o subscribe pendente (`cancelled`) e removendo o canal quando já criado. Ver **ADR-0010** (o "porquê" do `setAuth` — não remover).

### Ajustes de UI do painel (modal)
- **`Modal` (`src/components/ui/modal.tsx`)** passou a renderizar via **portal para o `body`** (`z-[100]`): antes ficava dentro do header azul (stacking context `z-50` + `text-white`), então herdava a cor branca (botões "invisíveis") e deixava a bottom nav clicável por trás. Agora também **trava o scroll do documento** (`body.overflow = hidden`), **prende o foco (Tab/Shift+Tab) dentro da janela** (o foco não vaza mais para header/bottom nav; restaura o foco anterior ao fechar; foca o painel ao abrir) e fecha no **Esc**. Vale para os 4 usos (sino, casas, recompensas, tarefas).
- **Sino (`notifications-bell.tsx`):** botões "Marcar todas" (azul) e "Apagar todas" (vermelho) com cores explícitas (não dependem mais de `currentColor`); botão individual de **marcar como lida** (ícone `Check`) adicionado ao lado do de apagar; itens com hover/borda e título com `truncate`.

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npx tsc --noEmit` ✓ · `npm run build` ✓ (12 workers, `ƒ Proxy` ativo) · probes de Realtime: sessão do storage `BROKEN` (0 eventos) × com `setAuth` `WORKS` (1 evento).

### Decisões
- Notificações são **efeito secundário**: registro best-effort, sem rollback da ação principal em caso de falha.
- `title`/`body` são snapshot em texto (histórico preservado mesmo se nomes/títulos mudarem depois) — evita joins e simplifica o Realtime.
- Retenção lazy (sem `pg_cron`) e leitura via service-role com escopo de sessão (ADR-0001/0006), mantendo a policy de SELECT apenas para o Realtime.
- Detalhamento do "porquê" no **ADR-0009** (`docs/adr/0009-notificacoes-entre-admin-e-dependente.md`) e, para o Realtime, no **ADR-0010** (`docs/adr/0010-realtime-exige-setAuth-da-sessao.md`).

---

## Tutores da casa e criador da tarefa para o dependente (concluída)

### O que foi implementado
- **`getHouseTutors(houseId)`** (`src/utils/house.ts`, substitui o antigo `getHouseTutor` baseado em `owner_id`): lista **todos os ADMIN membros** da casa (`house_members.role='ADMIN'`) — dono e co-gerentes via PIN. Service role (o dependente não tem RLS de leitura de `profiles` de terceiros).
- **Dashboard do DEPENDENTE (`dashboard/dependent/page.tsx`):** o card "Seu tutor" virou **"Seu tutor"/"Seus tutores"** (título pluraliza conforme a quantidade) e lista cada ADMIN membro com avatar (ou inicial) + nome.
- **`getProfileNames(ids)`** (`src/utils/house.ts`): mapa `profile_id → full_name` (service role) para resolver o criador de tarefas.
- **Cards de tarefa do DEPENDENTE (`tasks-dependent.tsx`):** exibem **"Criada por {nome}"** (`tasks.created_by`) nos cards abertos, aguardando aprovação e concluídos; `src/app/tasks/page.tsx` monta o mapa a partir das tarefas carregadas e passa `creatorNames` ao componente (fallback "Administrador" para quem não estiver no mapa, ex.: tarefa nova via Realtime).

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npx tsc --noEmit` ✓ · `npm run build` ✓ (12 workers, `ƒ Proxy` ativo).

### Decisões
- Tutores = **todos os ADMIN membros** (não apenas o `owner_id`), coerente com o co-controle por PIN (ADR-0006).
- O criador é resolvido por mapa de nomes no servidor (service role) em vez de join na query de tarefas, evitando a ambiguidade das FKs de `tasks` para `profiles` (`created_by` × `completed_by`) e funcionando igual para ADMIN/dependente.

---

## Restaurar tarefa aprovada (concluída)

### O que foi implementado
- **`restoreTask(taskId)`** (`src/actions/tasks.ts`): ADMIN restaura uma tarefa `APPROVED` para reaproveitá-la em vez de criar outra idêntica. Transição guardada `.eq('status','APPROVED')` (impede restaurar duas vezes). Preserva **todos os dados** (título, descrição, pontos, atribuição, imagem, `house_id`, `created_by`) e **não altera os pontos já creditados** do dependente; apenas limpa a conclusão (`completed_by`/`completed_at`), zera as flags de adiamento e reinicia o **prazo para agora + 1 dia** (`due_date`), voltando o status para `PENDING`.
- **UI ADMIN (`tasks-admin.tsx`):** botão **"Restaurar"** sempre visível no cabeçalho do card em "Aprovadas" (fora do toggle colapsável); atualização otimista move o card de volta para Pendentes com o prazo novo.
- **DEPENDENTE:** a tarefa reaparece em "Suas tarefas" como `PENDING` (prazo futuro), pronta para ser concluída de novo — sem duplicar linhas em `tasks`.

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npx tsc --noEmit` ✓ · `npm run build` ✓ (12 workers, `ƒ Proxy` ativo).

### Decisões
- Restaurar **não** devolve nem debita pontos (diferente de `rejectCompletedTask` e do adiamento de `NOT_DELIVERED`): o crédito anterior é histórico e o dependente ganha novamente se concluir de novo.
- Novo prazo = agora + 1 dia (reinicia o SLA sem nascer "Atrasada"); o ADMIN pode ajustar o prazo depois via `updateTask`.
- Detalhamento do "porquê" no **ADR-0008** (`docs/adr/0008-restaurar-tarefa-aprovada.md`).

---

## Tarefa "não entregue" (NOT_DELIVERED) com penalidade (concluída)

### O que foi implementado
- **Novo status `NOT_DELIVERED`** no enum `task_status`; chip vermelho "Não entregue" e borda-accent vermelha em `task-styles.ts` (badge de SLA "Atrasada" é omitido nesse status — o chip já comunica).
- **`markTaskNotDelivered(taskId)`** (`src/actions/tasks.ts`): ADMIN marca uma tarefa **atrasada** (`due_date < now`, status `PENDING/IN_PROGRESS`) como não entregue. Transição guardada `.in('status', ['PENDING','IN_PROGRESS'])` (impede débito duplicado) e **debita `tasks.points`** de `profiles.points` via service role — o saldo **pode ficar negativo**. Falha no débito → rollback do status. Revalida `/tasks`, `/rewards` e `/dashboard/dependent`.
- **Reversão (adiamento) devolve os pontos e zera a tarefa:** aprovar um adiamento (`resolveTaskExtension`) numa tarefa `NOT_DELIVERED` soma `tasks.points` de volta ao dependente, **zera `tasks.points`** e redefine o status para o equivalente ao novo prazo (futuro → `PENDING`); falha na devolução → rollback para `NOT_DELIVERED` com o pedido pendente. A **edição direta do prazo** (`updateTask`) tem o mesmo efeito (auto-aceite + devolução).
- **Guardas:** `completeTask` e `adminCompleteTask` rejeitam `NOT_DELIVERED` (não há "Concluir" nem "Concluir e creditar"); `updateTask` rejeita editar `points` de uma tarefa não entregue (os pontos só mudam pela reversão) e permite editar título/descrição/prazo/atribuição.
- **UI ADMIN (`tasks-admin.tsx`):** tarefa `NOT_DELIVERED` permanece na seção Pendentes com chip vermelho; botão **"Marcar como não entregue"** aparece em tarefas abertas já atrasadas; no estado não entregue some o editor de pontos, o "Concluir e creditar" e o botão de marcar, restando a edição de prazo e o banner de adiamento (com aviso de que aprovar devolve os pontos). Atualizações otimistas tratam o débito/reversão.
- **UI DEPENDENTE (`tasks-dependent.tsx`):** a tarefa continua em "Suas tarefas" com o chip "Não entregue", **sem** o botão "Concluir tarefa" e **mantendo** "Pedir mais tempo"; aviso "Marcada como não entregue. Peça mais tempo para reabrir a tarefa."

### SQL aplicado no Supabase (registro)
O valor do enum já existe no banco:
```sql
alter type public.task_status add value if not exists 'NOT_DELIVERED';
```

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npx tsc --noEmit` ✓ · `npm run build` ✓ (12 workers, `ƒ Proxy` ativo).

### Decisões
- Pontos negativos são um estado válido (penalidade integral, sem clamp em 0); resgates continuam barrados pela validação de saldo.
- `NOT_DELIVERED` é terminal até o prazo ser reaberto; reabrir (adiamento/prazo) **zera `tasks.points`**, então a tarefa reaberta não paga pontos mesmo se concluída depois.
- Detalhamento do "porquê" no **ADR-0007** (`docs/adr/0007-tarefa-nao-entregue-penalidade-e-restauracao.md`).

---

## Co-controle de casa por PIN (concluída)

### O que foi implementado
- **PIN de casa = `houses.code`:** criado junto com a casa (já existente, único); agora exibido nos cards em `/dashboard/admin/houses` com botão de copiar.
- **`joinHouseByPin(pin)`** (`src/actions/houses.ts`): outro ADMIN informa o PIN durante a criação de casa (aba "Entrar com PIN" no card "Nova casa") → valida o PIN, insere `house_members.role='ADMIN'` (se ainda não for membro; bloqueia se for DEPENDENT), define a casa como ativa e passa a controlá-la junto com o dono. `getActiveAdminHouse`/`selectHouse`/`createDependent`/`updateHouse`/`updateDependentProfile` e os `assertAdminCanManage` de tarefas/recompensas passam a validar **controle por membresia ADMIN** em vez de `houses.owner_id`.
- **`getAdminHouses(userId)`** (`src/utils/house.ts`): casas controladas via `house_members` (role ADMIN) — criadas e co-geridas. Used nas páginas admin. **Lida com o cliente service-role** (precedente de `getHouseTutors`) porque a listagem de casas/membros/atribuições (`getHouseAssignees`) não deve depender de policies RLS específicas para co-gerentes; o `userId` sempre vem da sessão.
- UI: toggle "Criar casa" / "Entrar com PIN" no card Nova casa; PIN visível/copiável em cada card de casa.

### SQL aplicado no Supabase (registro)
O banco tem `houses.code` e `house_members.role='ADMIN'`. A listagem de casas, membros e atribuições lê via service role — **não depende das policies abaixo**. Elas foram aplicadas para o **Realtime** (os canais aplicam RLS a cada subscriber) e para futuras leituras via cliente autenticado:
```sql
create policy "houses_select_for_admin_members" on public.houses
  for select to authenticated
  using (exists (
    select 1 from public.house_members hm
    where hm.house_id = houses.id
      and hm.profile_id = auth.uid()
      and hm.role = 'ADMIN'
  ));

create policy "house_members_select_for_admin_members" on public.house_members
  for select to authenticated
  using (exists (
    select 1 from public.house_members me
    where me.house_id = house_members.house_id
      and me.profile_id = auth.uid()
      and me.role = 'ADMIN'
  ));
```

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npx tsc --noEmit` ✓ · `npm run build` ✓ (12 workers, `ƒ Proxy` ativo).

### Decisões
- PIN reutiliza `houses.code` (6 caracteres, já único e gerado na criação) em vez de nova coluna — evita migração de schema; semântica de "convite/controle" já era a do campo.
- Autorização de ADMIN passou de "dono" para "membro ADMIN": a membresia é a fonte da verdade do co-controle; `owner_id` continua identificando o tutor/criador (hoje o card lista todos os tutores via `getHouseTutors`).
- Listagens de casas/membros/atribuições usam service role: RLS de `houses`/`house_members`/`profiles` não tinha (nem precisa ter) policy de leitura cross-role para co-gerentes; isolar por here, sem as policies as casas somem da UI mesmo com a query "OK" no SQL editor (que roda como superuser e ignora RLS).
- **Leituras de tarefas/recompensas também via service-role** (`/tasks` e `/rewards`): a RLS de `tasks`/`rewards`/`reward_redemptions`/`reward_suggestions` é centrada no `owner_id` da casa, então o co-gerente (e o dependente nas tarefas do co-gerente) não enxergava nada. O escopo é explícito e derivado da sessão: ADMIN → `.eq('house_id', activeHouse.id)`; DEPENDENT → `.eq('house_id', house.id).eq('assigned_to', user.id)` (ou `.eq('profile_id', user.id)` em resgates/sugestões). `getDependentHouse` também passou a usar service-role. Detalhamento do "porquê" no **ADR-0006** (`docs/adr/0006-leituras-cross-role-via-service-role.md`).
- **Limite conhecido — Realtime:** as subscriptions dos client components (`use-postgres-changes`) continuam sujeitas à RLS (não há como usar service role no browser). Sem policies de `SELECT` por membro, eventos ao vivo podem não chegar ao co-gerente/dependente; o `router.refresh()` pós-ação garante a atualização de quem age, e as policies de `SELECT` por membro (bloco acima) são a forma de habilitar o Realtime cross-role.

---

## UX de tarefas (data/hora, conclusão ADMIN e adiamento flexível)

### O que foi implementado
- **Data/hora pré-selecionada ao criar tarefa:** o campo `datetime-local` do form inicia com o agora (`nowDateTimeLocalValue` em `src/utils/datetime-local.ts`); input segue não-controlado na leitura (FormData), com `suppressHydrationWarning`.
- **Botões de ajuste rápido de prazo:** "Amanhã" (+1 dia), "+2h", "Limpar" (reseta para agora) via `modifyDateTimeLocal` — o campo virou controlado (`dueDate`). Form ganhou `md:items-start` para evitar que o grid estique as células (o input de "Pontos" não desalinha mais).
- **Bug corrigido — prazo vazio no card ADMIN:** `datetime-local` rejeitava o ISO completo do banco; `isoToDateTimeLocalValue` (`src/utils/datetime-local.ts`) converte para `YYYY-MM-DDTHH:mm`.
- **ADMIN conclui e aprova a tarefa de uma vez:** nova action `adminCompleteTask` (`src/actions/tasks.ts`) — `PENDING/IN_PROGRESS → APPROVED` com guard `.in('status', [...])`, registra `completed_by/completed_at` do ADMIN e **credita pontos**; falha na creditação reverte ao estado anterior. Botão verde "Concluir e creditar pontos" no card pendente do ADMIN, mesmo com prazo ainda válido.
- **ADMIN desaprova a conclusão do dependente:** action `rejectCompletedTask` — `COMPLETED → PENDING` com guard `.eq('status','COMPLETED')`, limpando `completed_by`/`completed_at` (o dependente refaz e marca de novo). Botão "Desaprovar" (outline) no cabeçalho do card concluído, ao lado de "Aprovar"; a transição guardada impede reabrir uma tarefa já creditada em outra aba.
- **Adiamento flexível:** `resolveTaskExtension(taskId, approve, days=3)` agora aceita dias configuráveis; banner do ADMIN ganhou os botões **Aprovar (+1 dia)** e **Aprovar (+3 dias)** além do **Rejeitar**.
- **Auto-aceite de adiamento via edição do prazo:** no `updateTask`, se `extension_requested` estiver pendente e o ADMIN alterar `due_date` para um valor diferente do atual (comparação por instante via `dueDateChanged`), as flags são limpas automaticamente e a nova data prevalece — sem passar pelos botões do banner.
- **Cards colapsáveis (só ADMIN):** em `tasks-admin.tsx` cada tarefa (pendentes, concluídas e aprovadas) tem um cabeçalho clicável (chip de status/SLA + título + pontos + chevron) que colapsa/expande o corpo; **todas vêm recolhidas por padrão** (`expandedIds: Set<string>`). O card concluído mantém o botão "Aprovar" sempre visível (fora do toggle, label encurtado no mobile); os demais detalhes (imagem, campos editáveis, prazo, botão "Concluir e creditar") ficam no corpo expandido.

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npx tsc --noEmit` ✓ · `npm run build` ✓ (12 workers, `ƒ Proxy` ativo).

### Pontos de atenção
- `dueDateChanged` compara instantes (`getTime`); desde a correção de fuso (ver seção "Bug de fuso em prazos de tarefas" no topo) todo `due_date` é `timestamptz`/ISO com fuso, então a comparação é absoluta e correta.

---

## Edição completa ADMIN, imagens, SLA, sugestões e extensões (concluída)

### O que foi implementado
- **Edição sem DELETE:** ADMIN edita casas (nome+foto), dependentes (nome/username/avatar), recompensas (título/custo/descrição/emoji/foto) e o próprio perfil (nome+avatar). `updateHouse`, `updateDependentProfile`, `updateReward`, `updateOwnProfile` — sempre validando posse via service role (`houses.owner_id`).
- **Uploads (Supabase Storage):** bucket público `casasync-media` (pastas avatars/houses/rewards/tasks/suggestions). Helper `src/utils/media.ts` (uploadMedia) + componente `ImageUpload` (prévia, remover, estado de envio). `tasks`/`houses`/`rewards` ganharam `image_url` nos cards.
- **SLA de prazos:** `src/utils/task-sla.ts` → `getTaskSlaStatus(createdAt, dueDate)`: **Atrasada** (agora > prazo; card `border-red-500 bg-red-50 text-red-700`) e **Prazo próximo** (restante ≤ 20% do total; `border-amber-400 bg-amber-50 text-amber-800`). Aplicado nos cards abertos de ADMIN e DEPENDENT via `task-styles.ts`.
- **Sugestões de recompensa (`reward_suggestions`):** dependente envia (título/descrição/custo/foto) pela loja; o ADMIN aprova (**cria a recompensa real** — transição guardada `PENDING→APPROVED` com rollback) ou rejeita. Realtime e seção "Suas sugestões" no lado do dependente.
- **Pedido de adiamento:** dependente clica "Pedir mais tempo" (justificativa obrigatória) → `tasks.extension_requested=true` + `extension_reason`. ADMIN vê banner no card pendente e **Aprova (+3 dias sobre o prazo atual ou hoje)** ou **Rejeita** (`resolveTaskExtension`). Flags limpas nos dois casos.
- **Identificação do tutor:** card "Seu tutor" no dashboard do dependente (avatar+nome do ADMIN, service role; depois generalizado para **todos os tutores** em `getHouseTutors`). `getSessionProfile` agora expõe `avatar_url`.
- **Types:** `src/types/database.ts` espelha o schema real (`image_url` nas 3 tabelas, `extension_*`, tabela `reward_suggestions` com relationships).

### SQL aplicado no Supabase (registro)
O script `supabase/migration_features.sql` criou as colunas, a tabela de sugestões (RLS select para membros da casa; escritas via service role), o bucket público `casasync-media` com policies e incluiu `reward_suggestions` na publication `supabase_realtime`. **Já aplicado** — as features de imagem/sugestão/extensão estão operacionais.

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` — `<img>` deliberado para URLs do Storage) · `npx tsc --noEmit` ✓ · `npm run build` ✓ (12 workers, `ƒ Proxy` ativo) · smoke dev: `/login` 200, `/register` 200, `/tasks`/`/rewards`/dashboards 307 (proxy).

### Decisões / pontos de atenção
- Padrão mantido: escritas só via `createAdminClient()`; autorização via sessão + posse (`assertAdminCanManage`/`owner_id`). Senhas continuam fora de estado React.
- Sugestão aprovada usa `points_cost ?? 5` se o dependente não informou custo; resgate de sugestão vira recompensa real de imediato.
- Extensão aprovada SEMPRE soma 3 dias (base: prazo atual se futuro, senão agora) — o prazo final fica no `due_date`.
- UI de upload reutilizada em 6 lugares; keeps `next/image` fora porque as imagens vivem em URL pública de Storage.

---

## UI/UX Mobile-First — redesign visual (concluída)

### Design system
- **Paleta global (`globals.css`, tokens shadcn):** background `slate-50`, texto `slate-800`, primária `blue-600` (hover `blue-700`), border/input `slate-200`, muted `slate-100`, ring azul. Cards `bg-white` com `rounded-2xl` + `border-slate-200/80` (primitiva `Card`), botões/inputs com `min-h-12` (48px de toque) e `rounded-xl`.
- **Primitivas ajustadas:** `card.tsx` (rounded-2xl, borda suave, shadow-sm), `button.tsx` (default `bg-blue-600`, tamanhos com altura mínima de 48px), `input.tsx` (min-h-12, bg-white). `layout.tsx` ganhou `bg-slate-50`/`text-slate-800`/`antialiased` e `lang="pt-BR"`.

### Cabeçalho fixo & bottom nav (dark, alto contraste)
- **Header fixo em todas as viewports** (`dashboard-nav.tsx`): `fixed inset-x-0 top-0 z-50 bg-blue-700 text-white shadow-md`, com marca (ícone `House` âmbar), **nav central no desktop** (`md:flex`, item ativo `bg-white/20`), **badge de pontos** `bg-amber-400 text-slate-900 font-bold`, avatar com inicial e nome do usuário (desktop) e `Sair` (desktop).
- **Bottom navigation mobile** escura: `fixed inset-x-0 bottom-0 z-50 bg-slate-900 text-slate-300 border-t border-white/10 pb-[env(safe-area-inset-bottom)] shadow`; item ativo com **pílula `bg-blue-600 text-white` no ícone** + label `text-sky-400`; slot de **Sair** quando há < 4 itens (dependentes).
- **Canvas (`layout.tsx`):** fundo global `bg-slate-100` (cards brancos ganham contraste); containers dos layouts admin/dependent e das páginas `/tasks` e `/rewards` passaram a `p-4 pt-20 pb-24 md:p-6 md:pt-24 md:pb-6` para conteúdo não ficar escondido atrás do header/bottom nav fixos.
- `DashboardNav` agora recebe `userName` e `points` (layouts/páginas via `getSessionProfile`).

### Cards, tarefas e recompensas
- **Tarefas (`task-styles.ts`):** mapa compartilhado de status → card com **borda esquerda colorida** (Pendente azul, Em andamento sky, Concluída âmbar, Aprovada verde) + **chip de status** e pill de pontos (`bg-sky-100 text-sky-700`). Botão "Aprovar e creditar" em verde, ícones em cada seção.
- **Recompensas:** card de saldo em gradiente azul (dependente/dashboard), emoji de recompensa, pills de custo, resgates com borda-colorida por status; "Aprovar e debitar" em verde; "Rejeitar" outline.
- **Dashboards:** header em gradiente azul ("Visão geral"/boas-vindas + casa ativa), cards de ação com ícone em chip colorido, hover lift (`-translate-y-0.5` + shadow). Houses: casa ativa com destaque azul, badges de membro por role.

### Auth
- `/login` e `/register` ganharam header de marca (ícone em quadrado azul + "CasaSync" + subtítulo) centrado, mobile-first.

### Formulários por demanda (progress disclosure)
- Exceto os de **autenticação**, todo formulário de criação só aparece ao clicar num botão: **Nova casa**, **Novo dependente** (`houses-manager.tsx`), **Nova tarefa** (`tasks-admin.tsx`) e **Nova recompensa** (`rewards-admin.tsx`).
- Padrão: `CardAction` com `Button variant="outline" size="sm"` no header do card que alterna `showXForm` (`useState`); form fecha ao sucesso (função de criar → `setShowXForm(false)`). "Novo dependente" fica `disabled` se não há casa ativa.

### Gamificação & micro-interações
- **Paleta de significado:** saldo/placar de pontos em **gradiente ouro** (`from-amber-500 via-yellow-500 to-amber-600` + `shadow-amber-500/20`); ações de sucesso em **esmeralda** (`bg-emerald-500 hover:bg-emerald-600` + `shadow-emerald-500/25`) com badges `bg-emerald-50 text-emerald-700`; hero/banners de boas-vindas em **gradiente azul→índigo** (`from-blue-600 to-indigo-600`, `rounded-3xl`, `p-6`); pills de pontos agora âmbar (`bg-amber-100 text-amber-700`).
- **Feedback tátil:** `Button` (primitiva) ganhou `active:scale-95 transition-all duration-200` global e sombra azul no variant default (`shadow-lg shadow-blue-500/25`); cards interativos e itens da bottom/top nav com `active:scale-95`/`active:scale-[0.98]`.
- **Empty states (`components/ui/empty-state.tsx`):** card centralizado com ícone grande em círculo de fundo suave, borda tracejada (`border-dashed`), título + mensagem motivacional com emoji ("Tudo limpo por aqui! 🎉", "Loja vazia por enquanto… 🎁"). Aplicado em tarefas pendentes/aprovação, loja vazia e resgates vazios (ADMIN e DEPENDENT).

### Verificação
`npm run lint` ✓ · `npx tsc --noEmit` ✓ · `npm run build` ✓ · dev smoke test: `/login` e `/register` → 200 com marca renderizada.

### Notas
- Não há rota `/perfil` hoje; no mobile o 4º slot da bottom nav é o **Sair** (para dependentes, 3 itens fixos) em vez de Perfil.
- Lucide disponível (`lucide-react`); ícones usados: `LayoutDashboard, House, ListTodo, Gift, CircleCheck, CircleCheckBig, ClipboardList, Coins, PartyPopper, Layers, LogOut`.

---

## Segurança de credenciais — senha fora do estado React (concluída)

### O que foi implementado
- **Problema:** ao registrar usuários, a senha (e o `masterPin`) ficavam em `useState` como inputs controlados (`value={password}`) e eram passados como argumentos para as Server Actions. Isso deixava a credencial visível no estado do componente (React DevTools) e serializada nos argumentos da action — vulnerabilidade percebida como "senha aparece no console".
- **Fix nos forms (`login-form.tsx`, `register-form.tsx`, `houses-manager.tsx`):** removidos os estados de senha/usuario (`useState`) — inputs viraram **uncontrolled** (só `name`), com a leitura feita via `FormData(event.currentTarget)` **no momento do submit**; a senha nunca entra no estado/árvore React do cliente e é descartada após o uso. Formulários de sucesso fazem `event.currentTarget.reset()`.
- **Server Actions blindadas (`auth.ts`, `houses.ts`):** nenhuma ação pode lançar exceção não tratada (se lançasse, o Next sobreporia erro de dev com os argumentos da requisição). `createAdminClient()` (env de service role ausente) agora é envolvido em try/catch → retorna `{ ok: false, error: 'Configuração do servidor indisponível.' }` em vez de lançar.
- **Verificação:** `npm run lint` ✓ · `npx tsc --noEmit` ✓ · `npm run build` ✓.

### Limite honesto (não corrigível só com código)
- A senha **precisa** trafegar até o servidor em qualquer login/cadastro (payload de rede / aba Network do DevTools). O que o fix garante: ela **não** fica em memória/estado React do cliente, **não** é reintroduzida por nenhum log e as ações **nunca** expõem argumentos por exceção. Em produção, o tráfego é a encriptar via HTTPS.

---

## Autenticação simplificada por PIN + Username (concluída)

### O que foi implementado
- **Cadastro de ADMIN via PIN do sistema:** a Server Action `registerAdmin` (`src/actions/auth.ts`) agora recebe `fullName`, `username`, `password` e `masterPin`. Valida `masterPin === process.env.MASTER_PIN` (env `MASTER_PIN` passou a ter uso); username precisou ser único → checado em `profiles` via service role; conta criada com `admin.auth.admin.createUser({ email: "${username}@admin.casasync", password, email_confirm: true })` — usuário já **100% confirmado** (sem e-mail de confirmação); perfil gravado em `public.profiles` (`id`, `full_name`, `username`, `user_role: 'ADMIN'`), com rollback (`deleteUser`) se o perfil falhar.
- **Login por username (`src/actions/auth.ts` `login`):** normaliza o username, resolve o domínio do e-mail sintético em `profiles` conforme a role (`@admin.casasync` para ADMIN, `@dependente.casasync` para DEPENDENT) e chama `supabase.auth.signInWithPassword` pelo cliente do servidor (cookies na própria action). Mensagem genérica "Credenciais inválidas." nos dois casos (não revela usernames existentes).
- **Dependentes também por username:** `createDependent` (`src/actions/houses.ts`) agora recebe `username` em vez de e-mail; gera o e-mail sintético `@dependente.casasync`, checa unicidade e cria a conta com `email_confirm: true`. O form em `houses-manager.tsx` trocou o campo E-mail por "Nome de usuário".
- **UI em `/login`:** abas **"Entrar"** (username + senha, válido para ADMIN e DEPENDENT no mesmo form — sem Google OAuth) e **"Criar Conta Admin"** (Nome completo, Nome de usuário, Senha, PIN do sistema) em `login-form.tsx`; `register-form.tsx` atualizado para os novos campos e reutilizado na aba e na rota `/register` (mantida como URL independente).

### Pontos de atenção / próximos passos *(histórico — já aplicado)*
- **Banco:** a coluna `profiles.username` (única, lowercase) **já existe** no Supabase e as contas foram validadas — o cadastro/login por username está operacional (ver o aviso no topo).
- Removido o login com **Google** (não faz sentido sem e-mail). `src/app/auth/callback/route.ts` ficou sem uso e foi **removido** (ver "Refresco de documentação e contexto" no topo).
- `validateCredentials`/`EMAIL_PATTERN` removidos de `actions/types.ts`; novos helpers `validateUsername` (3–24 chars, `[a-z0-9._-]`) e `validatePassword` (≥6).
- Gerar types via `supabase gen types` para casar com o schema real (inclui `username`).

---

## Manutenção pós-migração para `src/` (concluída)

### Verificação
`npm run lint` ✓ · `npx tsc --noEmit` ✓ · `npm run build` ✓ · `next dev` ✓ (rotas/proxy OK; `/login` e `/register` renderizando sem erros; rotas protegidas redirecionando para `/login`).

### Bugs reais encontrados e corrigidos
- **Login com ordem garantida (auth → `profiles`):** o login por e-mail/senha era feito no cliente e só consultava `profiles` depois, no proxy. Criada a Server Action `login` em `src/actions/auth.ts` que executa `signInWithPassword` PRIMEIRO e somente após confirmar ausência de erro de auth busca `user_role` na tabela `profiles` (via RLS) para redirecionar ao dashboard da role. As cookies são gravadas na própria action; o browser client (via `createClient`) continua sendo usado apenas no login com Google. `login-form.tsx` agora chama a action.
- **Hydration error no login/register (extensão de gerenciador de senhas):** o browser injeta `style`/botões nos inputs de e-mail/senha após o SSR → mismatch de atributos. Adicionado `suppressHydrationWarning` aos inputs afetados em `login-form.tsx`, `register-form.tsx` e `houses-manager.tsx` (fix canônico do React para o caso de extensão do navegador).
- **`updateTask` com `assigned_to: ''`:** ao desatribuir um dependente ("Sem atribuição"), uma string vazia era enviada para a coluna `uuid` → erro do Postgres. Agora `''` é normalizado para `null` (`src/actions/tasks.ts`).
- **Dropdown de atribuição sem update otimista:** o `<select>` controlado só refletia a mudança quando o Realtime ecoava (ou nunca, sem publication). Agora atualiza o estado otimista e envia `null` para desatribuir (`src/components/tasks/tasks-admin.tsx`).
- **`handleRedeem`/`handleComplete` sem catch:** se a Server Action disparasse uma exceção de rede, `pendingId` ficava travado em "Resgatando..." e a rejection ficava sem tratamento. Protegidos com `try/catch/finally` (`src/components/rewards/rewards-dependent.tsx`, `src/components/tasks/tasks-dependent.tsx`).

---

## Refatoração de estrutura (concluída)

### O que foi feito
- **Migração para `src/`:** todo o código de aplicação foi movido para uma pasta `src/` (Next.js passa a usar `src/app` como rota do App Router — detectado automaticamente).
- **`@/` alias atualizado:** `tsconfig.json` agora mapeia `"@/*": ["./src/*"]`; todas as importações `@/...` continuam resolvendo sem alteração de arquivo.
- **`proxy.ts` movido para `src/proxy.ts`:** conforme docs do Next.js 16, o arquivo de proxy deve ficar no mesmo nível de `app` (`src/app`) — build continua exibindo `ƒ Proxy (Middleware)`.
- **Route group `(auth)`:** `/login` e `/register` agora vivem em `src/app/(auth)/` (grupo de rota sem efeito na URL; `PUBLIC_PATHS` do proxy segue válido).
- **Server Actions reunidas por domínio:** `createDependent` foi mesclado em `src/actions/houses.ts` (junto de `createHouse`/`selectHouse`), removendo `actions/create-dependent.ts`.
- **`components.json` atualizado:** caminho do CSS global para `src/app/globals.css` (aliases `@/components`, `@/lib/utils`, `@/hooks` já compatíveis).
- Sem mudança de importações nos componentes (padrão já usava alias `@/`); `next-env.d.ts`, `next.config.ts` e `.env.local` permanecem na raiz.

### Nova árvore de diretórios
```
src/
├─ app/                        # Rotas do App Router (src/app)
│  ├─ (auth)/                  # Grupo de rota (sem efeito na URL)
│  │  ├─ login/page.tsx
│  │  └─ register/page.tsx
│  ├─ dashboard/
│  │  ├─ admin/                # Visão ADMIN (layout, visão geral, houses/)
│  │  └─ dependent/            # Visão DEPENDENT (layout, visão geral)
│  ├─ tasks/page.tsx           # Tarefas (role-aware)
│  ├─ rewards/page.tsx         # Recompensas (role-aware)
│  ├─ layout.tsx · globals.css · page.tsx
├─ components/                 # Componentes por domínio
│  ├─ ui/                      # Shadcn UI (button, card, input, label, separator, tabs, modal, empty-state, image-upload)
│  ├─ auth/                    # login-form, register-form, sign-out-button
│  ├─ dashboard/               # dashboard-nav, profile-editor
│  ├─ tasks/                   # debounced-field, tasks-admin, tasks-dependent, task-styles
│  ├─ rewards/                 # rewards-admin, rewards-dependent
│  ├─ houses/                  # houses-manager
│  └─ notifications/           # notifications-bell, quick-message-composer
├─ actions/                    # Server Actions por domínio
│  ├─ auth.ts · types.ts
│  ├─ houses.ts                # createHouse, selectHouse, createDependent, …
│  ├─ tasks.ts
│  ├─ rewards.ts
│  └─ notifications.ts
├─ utils/
│  ├─ house.ts                 # helpers de sessão/casa ativa
│  ├─ notifications.ts         # notifyUser/notifyHouse (best-effort), retenção e limpeza
│  ├─ quick-message.ts         # helpers da mensagem rápida (capacidade/cleanup)
│  ├─ media.ts                 # uploadMedia (bucket casasync-media)
│  ├─ task-sla.ts              # SLA de prazos
│  └─ supabase/                # server.ts, client.ts, admin.ts, middleware.ts
├─ types/
│  ├─ database.ts              # schema tipado (espelho manual)
│  └─ notifications.ts         # NotificationType (17 tipos)
├─ hooks/                      # use-postgres-changes, use-profile-points
└─ lib/
   └─ utils.ts                 # cn() (é a lib habitada; componentes ui usam pkg `cn`)
proxy.ts                        # proxy (Middleware) — raiz do src/
```
Raiz mantém: `AGENTS.md`, `PROJECT_STATUS.md`, `next.config.ts`, `tsconfig.json`, `components.json`, `eslint.config.mjs`, `.env.local`, `next-env.d.ts`, docs de ensino.

### Verificação
`npx tsc --noEmit` ✓ · `npm run lint` ✓ · `npm run build` ✓ (rotas idênticas às de antes; `ƒ Proxy (Middleware)` ativo).

---

## Etapa 3 — Casas, Tarefas, Pontos e Recompensas (concluída)

### Funcionalidades implementadas
- **Gestão de Casas (`/dashboard/admin/houses`):** ADMIN cria casas (código único gerado), alterna a **casa ativa** (cookie `casasync_active_house`), **cria contas de dependentes** (nome, e-mail, senha — vinculadas à casa ativa) e vê os membros vinculados.
- **`createDependent` estendido:** aceita `houseId` alvo; quando informado, a posse da casa é validada via service role (`.eq('owner_id', user.id)`) antes de vincular o dependente — evita vincular em casa que não pertence ao ADMIN mesmo com cliente adulterado.
- **Tarefas (`/tasks`, role-aware):**
  - ADMIN: cria tarefa para um dependente da casa (título, descrição, `due_date`, `points`); edita campos com **salvamento automático com debounce** (900 ms) e flush no blur; aprova tarefas concluídas creditando pontos.
  - DEPENDENTE: vê as próprias tarefas pendentes, marca como `COMPLETED`.
  - Aprovação: `COMPLETED → APPROVED` **soma** `tasks.points` em `profiles.points` (guards anti-crédito-duplicado + rollback).
- **Recompensas (`/rewards`, role-aware):**
  - ADMIN: cadastra recompensas (`points_cost`) e **aprova (`APPROVED`) ou rejeita (`REJECTED`)** resgates — aprovar **debita** os pontos do saldo.
  - DEPENDENTE: saldo ao vivo, catálogo e botão "Resgatar" com validação de saldo → cria `reward_redemptions` `PENDING`.
- **Realtime:** listeners `supabase.channel()` + `postgres_changes` (tarefas, recompensas, resgates e `profiles.points`) sincronizam Admin ↔ Dependente instantaneamente.

### Rotas / arquivos criados
- Rotas: `/dashboard/admin/houses`, `/tasks`, `/rewards`.
- Server Actions: `actions/houses.ts` (`createHouse`, `selectHouse`), `actions/tasks.ts` (`createTask`, `updateTask`, `completeTask`, `approveTask`), `actions/rewards.ts` (`createReward`, `requestRedemption`, `approveRedemption`, `rejectRedemption`).
- Helpers: `utils/house.ts` (`getSessionProfile`, `getActiveAdminHouse` via cookie, `getDependentHouse`, `getHouseAssignees`).
- Hooks Realtime: `hooks/use-postgres-changes.ts`, `hooks/use-profile-points.ts`.
- Componentes: `components/dashboard/dashboard-nav.tsx` (+ layouts admin/dependent), `components/houses/houses-manager.tsx`, `components/tasks/{debounced-field,tasks-admin,tasks-dependent}.tsx`, `components/rewards/{rewards-admin,rewards-dependent}.tsx`.
- `types/database.ts` — schema alinhado: `profiles.points`, `rewards.points_cost`, enums `task_status` (`PENDING/IN_PROGRESS/COMPLETED/APPROVED`) e `redemption_status` (`PENDING/APPROVED/REJECTED`).

### ENSINO (skill `teach` — documentação no código)
Sem saber se o CLD é invocável por modelo (`disable-model-invocation: true`), a documentação didática foi aplicada **no próprio código**:
- `hooks/use-postgres-changes.ts` — como o Realtime funciona (canal → assinatura `postgres_changes` → WebSocket; filter de casa + RLS = isolamento multi-tenant; cleanup obrigatório do canal).
- `hooks/use-profile-points.ts` — saldo ao vivo via UPDATE em `profiles` (defesa em camadas: filter `id=eq` + RLS).
- `components/tasks/debounced-field.tsx` — por que debounce evita uma chamada por tecla e flush no blur.
- `actions/tasks.ts` (approveTask) e `actions/rewards.ts` (approveRedemption) — transições guardadas (`COMPLETED→APPROVED`, `PENDING→APPROVED`), crédito/débito via cliente service-role e rollback em falha.

### Decisões arquiteturais / pontos de atenção
- **Padrão de escrita:** verificação de autorização SEMPRE via RLS/sessão (cliente autenticado: `houses.owner_id`, perfil ADMIN, `assigned_to`, casa do dependente); escritas sensíveis (crédito/débito de pontos, criação de usuários) via `utils/supabase/admin.ts` (service role, server-only).
- **Creditação de pontos em `profiles.points`** (não em `house_members`, como antes) — alinhado à spec da Etapa 3. Ajustar no banco: coluna `profiles.points int default 0`, remover `house_members.points`, renomear `rewards.cost → rewards.points_cost` e enums com valores em caixa alta.
- **Salvamento automático:** `useState` local + debounce com **flush no blur**; re-sincronização por `key={houseId}` (remount) em vez de `setState` em effect (exigência do novo linter `react-hooks/set-state-in-effect`).
- **Transição de status com guard:** `update().eq('status', ...)` impede crédito/débito duplicado em requisições concorrentes; falha na creditação reverte a tarefa/resgate ao estado anterior.
- **Realtime no Supabase:** as tabelas precisam estar na **publication `supabase_realtime`** (`alter publication supabase_realtime add table houses, house_members, profiles, tasks, rewards, reward_redemptions;`) e as policies SELECT existentes já controlam o que cada subscriber recebe.
- Status de tarefa imutáveis após `COMPLETED` (admin não edita mais; só aprova).

### Próxima etapa
1. Gerar types via `supabase gen types` para casar com o schema real (validação dos enums/colunas acima).
2. Garantir publication Realtime + políticas RLS no Supabase para as 6 tabelas.
3. Exibir o **código de acesso da casa** (`houses.code`) na UI para convite/registro de novos membros.
4. Estado vazio/UX de `IN_PROGRESS` e emoji de recompensas (campo `emoji` já tipado).

---

## Material de ensino — Segurança Supabase (workspace teach)

### O que foi criado
- Sessão da skill `teach` ativa (skill registrada em `skills-lock.json`, arquivos em `.agents/skills/teach/` — não em `.skills/`).
- `MISSION.md`, `RESOURCES.md`, `NOTES.md` (raiz) — workspace de ensino.
- `assets/lesson.css` — stylesheet compartilhado das lições.
- `lessons/0001-supabase-rls-defesa-em-camadas.html` — lição 1: cliente SSR (`utils/supabase/server.ts`) + RLS multi-tenant + Server Action `fetchMyTasks` de exemplo (defesa em camadas). Aberta no navegador.
- `reference/supabase-rls-security.html` — folha de referência (papéis anon/authenticated/service_role, padrão de policy seguro, checklist de armadilhas).

### Pontos de atenção
- Nenhum código de produção foi alterado; `fetchMyTasks` é ilustrativo (a tabela `tasks` ainda pertence à Etapa 4).
- Anotado como evolução futura: migrar `supabase.auth.getUser()` → `supabase.auth.getClaims()` no `updateSession` (docs atuais do Supabase preferem `getClaims()` no Proxy por validar assinatura do JWT a cada request).
- Conteúdo ensinado: autorização deriva da sessão (JWT verificado), nunca do input; RLS como backstop; padrão seguro `profile_id = (select auth.uid())` em policy multi-tenant; `user_metadata` não é lugar para claims de autorização; service role é server-only.

### Próxima etapa (ensino)
- Confirmação do quiz na lição 1 (2 perguntas) antes de registrar learning record.
- Lição 2 sugerida: escrita segura com `WITH CHECK` (INSERT/UPDATE) para tarefas e recompensas, ou `security definer` para evitá-la.
- Manter o restante da Etapa 4 do produto inalterado.

## Etapa 2 — Autenticação Completa (concluída)

### Funcionalidades implementadas
- **Shadcn UI configurado** (CLI v4, base Radix): `components/ui/{button,input,label,card,separator,tabs}.tsx` + `lib/utils.ts` + temas em `app/globals.css`.
- **Fluxo de Auth completo:**
  - Rota `GET /auth/callback`: troca `code` por sessão (Magic Link, Google OAuth, confirmação de e-mail) e redireciona para `/`.
  - Login em `/login` com abas **Administrador** (E-mail/Senha ou Google OAuth) e **Dependente** (E-mail/Senha criados pelo Admin).
  - Cadastro de novo ADMIN em `/register` (server action `registerAdmin`).
- **Criação de Dependentes pelo ADMIN:** server action `createDependent` (um DEPENDENT nunca se cadastra sozinho).
- **Proteção & redirecionamentos por role** no `proxy.ts` (via `updateSession`).

### Rotas / arquivos criados
- `app/auth/callback/route.ts` — callback do Supabase Auth.
- `app/login/page.tsx` + `components/auth/login-form.tsx` — login ADMIN/DEPENDENT (Tabs).
- `app/register/page.tsx` + `components/auth/register-form.tsx` — cadastro de ADMIN.
- `components/auth/sign-out-button.tsx` — logout.
- `app/dashboard/admin/page.tsx` e `app/dashboard/dependent/page.tsx` — placeholders protegidos por role.
- `actions/types.ts` (tipo `ActionResult` + validação), `actions/auth.ts` (`registerAdmin`), `actions/create-dependent.ts` (`createDependent`).
- `utils/supabase/admin.ts` — cliente **server-only** com `SUPABASE_SERVICE_ROLE_KEY`.
- `types/database.ts` — enums `user_role` (ADMIN/DEPENDENT) e `member_role` (ADMIN/DEPENDENT) + coluna `profiles.user_role`.
- `.env.local` — adicionado placeholder `SUPABASE_SERVICE_ROLE_KEY` (server-only).

### Decisões arquiteturais / pontos de atenção
- **`membership`:** o ADMIN precisa estar vinculado a pelo menos uma casa (`house_members`) para criar dependentes; a casa do dependente é a casa atual do ADMIN.
- **Sequência de segurança em `createDependent`:** valida sessão → confirma `user_role='ADMIN'` no perfil (via cliente autenticado, RLS) → busca `house_id` → usa o cliente admin (service role) para criar usuário (com `email_confirm: true`), upsert no perfil e vínculo em `house_members` com role `'DEPENDENT'`. Falhas intermediárias fazem cleanup (`deleteUser`).
- **Redirecionamentos centrados no `proxy.ts`:** `/` e rotas públicas (`/login`, `/register`) só são permitidas a anônimos; autenticados vão ao dashboard conforme `user_role`. Rotas `/dashboard/admin` e `/dashboard/dependent` são validadas pela role do usuário preguiçosamente no proxy.
- **Roles em caixa alta** (`'ADMIN'`/`'DEPENDENT'`) em `user_role` e `member_role` para alinhar a regra de negócio. **Validar com o schema real do Supabase.**
- `SUPABASE_SERVICE_ROLE_KEY` é **server-only** (nunca importar `utils/supabase/admin.ts` em client).
- Login dependente usa credenciais de e-mail/senha criadas pelo admin (não há Magic Link para dependentes nesta etapa).

### Próxima etapa
1. Preencher `.env.local` com chaves reais (URL, publishable key, service role key).
2. Configurar no Supabase: provedor Google OAuth habilitado, `Site URL`/`Redirect URLs` apontando para o app (ex: `http://localhost:3000/auth/callback`).
3. Etapa 3 — Gestão de Casa: criação de casa pelo ADMIN e área de criação de dependentes no `/dashboard/admin` (formulário chamando `createDependent`).
4. Etapa 4 — Tarefas e Recompensas (painéis ADMIN/DEPENDENT, aprovação de resgates).

---

## Infraestrutura de contexto para agentes (concluída)

- `docs/schema.md` — snapshot manual do schema Supabase (espelho de `src/types/database.ts`; marcadas as partes não verificáveis no código: Storage, RLS, publication Realtime). Instrução de regeneração via `supabase gen types` quando o CLI estiver linkado.
- `docs/adr/` — decisões arquiteturais extraídas do `PROJECT_STATUS.md`: `0001` (escritas service-role + transições guardadas), `0002` (username + e-mails sintéticos), `0003` (credenciais fora do estado React), `0004` (proxy Next 16), `0005` (imagens em Storage com `<img>`).
- `README.md` — substituído o boilerplate do create-next-app por guia do projeto (stack, comandos, setup, apontadores).
- `opencode.json` — corrigido caminho das skills `.skills/` → `.agents/skills/`.
- `package.json` — script `npm run typecheck` (tsc --noEmit) padronizado.
- `AGENTS.md` — §1 usa `npm run typecheck`; nova §6 Git (commits em português, curtos).
- `.github/copilot-instructions.md` — importa `@AGENTS.md` (mesmo padrão do `CLAUDE.md`).

### Verificação
`npm run lint` ✓ (só warnings `no-img-element` esperados) · `npm run typecheck` ✓.
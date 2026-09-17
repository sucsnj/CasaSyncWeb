# ADR-0009: Notificações entre ADMIN e dependente (sino no cabeçalho)

**Status:** aceito · **Data:** notificações in-app

## Contexto
ADMIN e dependente agem de forma assíncrona (tarefas, resgates, sugestões, adiamentos), mas o app não tinha um canal de aviso: quem agia só via o resultado do outro lado depois de navegar ou recarregar. Era necessário um local único, no cabeçalho (próximo ao avatar), com histórico, marcação de leitura e descarte.

Decisões confirmadas com o usuário antes de implementar:
1. **Destinatário = "o outro lado" da ação** (não a casa inteira): dependente recebe tudo que os ADMINs fazem; todos os ADMINs membros recebem tudo que o dependente faz. Quem agiu nunca é notificado.
2. **Retenção:** as notificações **lidas** são apagadas após **5 dias**.
3. Ações: **marcar todas como lidas + apagar todas + individual**.
4. **Realtime** no sino.
5. **Clique marca lida e abre a página relacionada** (deep link `/tasks` ou `/rewards`).

## Decisão
- **Schema (`notifications`):** `house_id`, `recipient_id`, `actor_id` (nullable), `type` (texto + CHECK), `title`, `body`, `link` (nullable), `read_at` (nullable; `null` = não lida), `created_at`. Uma linha por destinatário.
- **Registro best-effort (`src/utils/notifications.ts`):** `notifyUser` (um destinatário) e `notifyHouse` (resolve todos os ADMINs ou DEPENDENTEs da casa e exclui o ator). Ambas engolem falhas — a notificação é efeito secundário e **nunca** derruba a ação principal (crédito/débito de pontos, aprovações etc.).
- **Eventos cobertos:** criação/conclusão/aprovação/devolução/restauração de tarefa, `NOT_DELIVERED`, pedido e resolução de adiamento, criação de recompensa, pedido e resolução de resgate, criação e resolução de sugestão — integrados nas Server Actions existentes de `tasks.ts` e `rewards.ts`.
- **Retenção lazy:** `getMyNotifications(userId)` apaga as lidas com `read_at < now − 5 dias` antes de listar. Não depende de `pg_cron` (evita infra extra no Supabase).
- **Leitura/escrita:** a listagem e a limpeza usam **service-role** com escopo explícito no próprio `user.id` da sessão (padrão do projeto, ADR-0001/0006). As actions de gerenciamento (`src/actions/notifications.ts`) também escopam por `recipient_id = user.id`.
- **Realtime:** a tabela entra na publication `supabase_realtime`; o browser assina `recipient_id=eq.<userId>` e o RLS de SELECT (`recipient_id = auth.uid()`) garante que só as próprias notificações chegam.
- **UI:** `NotificationsBell` no cabeçalho (`dashboard-nav.tsx`), com badge de não lidas, painel em `Modal`, atualização otimista e realtime.

## Consequências
- Um único ponto de acesso (sino) para os dois papéis; sem depender de recarregar a página.
- Sem `pg_cron`: a limpeza só roda quando o usuário abre o app — notificações lidas antigas podem ficar no banco se ele nunca voltar (custo irrelevante para uso familiar).
- A notificação guarda `title`/`body` já formatados (snapshot): se um nome/título mudar depois, o texto antigo permanece — desejável para histórico.
- O deep link é simples (`/tasks`/`/rewards`), sem âncora no item específico.
- Migration SQL (aplicar manualmente no dashboard do Supabase — ver `PROJECT_STATUS.md`):
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

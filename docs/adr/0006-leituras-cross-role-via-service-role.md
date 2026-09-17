# ADR-0006: Leituras cross-role via service role com escopo derivado da sessão

**Status:** aceito · **Data:** co-controle de casa por PIN

## Contexto
O RLS do Supabase é centrado no `owner_id` da casa. Com o co-controle por PIN (mais de um ADMIN controlando a mesma casa), o dono e o co-gerente precisam enxergar a mesma casa, seus membros, atribuições, tarefas e recompensas — e o dependente precisa ver as tarefas que o co-gerente cria. As policies de SELECT existentes não cobriam esse cenário; sintomas: casas "sumindo" da UI e listas de tarefas/recompensas vazias para quem não era `owner_id`.

Armadilha de diagnóstico: o editor SQL do Supabase roda como superuser e **ignora RLS**, então validar a query por lá dá falso positivo.

## Decisão
- Controlar o acesso por **membresia** (`house_members.role='ADMIN'`), não por `owner_id`. `houses.owner_id` passa a identificar apenas o tutor/criador.
- Fazer as leituras cross-role com o cliente **service-role** (`createAdminClient`, server-only), com escopo **explícito e derivado da sessão** — `getSessionProfile().user.id`, casa ativa (`getActiveAdminHouse`) ou `houseId` — **nunca** de input público:
  - `getAdminHouses`, `getActiveAdminHouse`, `getHouseAssignees`, `getDependentHouse` (`src/utils/house.ts`);
  - página `/dashboard/admin/houses` (membros + perfis);
  - páginas `/tasks` e `/rewards` (ADMIN → `.eq('house_id', activeHouse.id)`; DEPENDENT → `.eq('assigned_to', user.id)` / `.eq('profile_id', user.id)`).
- Escritas continuam sob o padrão do ADR-0001 (autorização por sessão + transições com guard condicional).

## Consequências
- A UI funciona para dono e co-gerente independentemente das policies de leitura.
- O Realtime no browser **não** usa service role: os eventos ao vivo seguem sujeitos à RLS. Sem policies de SELECT para membros da casa, o `router.refresh()` pós-ação mantém quem agiu em dia, mas atualizações cross-role ao vivo podem não chegar. Policies por membro habilitam o Realtime (SQL em `PROJECT_STATUS.md`).
- A RLS deixa de ser o backstop das leituras cross-role; a segurança passa a depender de o escopo dessas funções ser **sempre** derivado da sessão. Nunca aceitar `userId`/`houseId` vindos do cliente nelas.

# ADR-0014: Exclusão real da conta de dependente (via app)

**Status:** aceito · **Data:** gestão de dependentes

## Contexto
Expulsar um dependente (`expelMember`) só remove a membresia e os dados ativos —
o perfil (`profiles`), a conta de login (`auth.users`), os pontos globais e o
`username` (único) permanecem no banco. Como o dependente não escolhe casa e não
existe caminho no app para re-vincular um perfil existente, o registro expulso
fica **órfão e sem utilidade** (login continua válido, vê "sem casa", e o
`username` fica ocupado para sempre), apenas sujando o banco.

Não há feature de exclusão de conta hoje. As FKs que um dependente toca:
- `tasks.assigned_to` / `tasks.completed_by` — **nuláveis** (histórico pode ficar).
- `reward_redemptions.profile_id` — **NOT NULL** (log de resgate não pode ser nulled).
- `notifications.recipient_id` — `on delete cascade`; `actor_id` — `on delete set null`.
- `push_subscriptions.user_id` — `on delete cascade`.
- `house_members.profile_id` — sem cascade (o app remove explicitamente).
- `houses.owner_id`, `tasks.created_by`, `rewards.created_by`,
  `reward_redemptions.approved_by` — nunca referenciam um DEPENDENT.
- `house_settings.updated_by` — `on delete set null`.

## Decisão
- **`deleteDependentAccount(houseId, targetUserId)`** (`src/actions/houses.ts`):
  - Autorização derivada da sessão (`getSessionProfile` → ADMIN) + **só o autor**
    da casa (`getOwnedHouse`), mesmo padrão de `expelMember`/`rotateHousePin`.
  - Alvo precisa ser membro **DEPENDENT** da casa (conta de ADMIN nunca é excluída
    — fora de escopo, o autor não exclui co-gerentes e não exclui a si mesmo).
  - **Ordem explícita de limpeza** (sem depender de cascade, padrão `deleteHouse`):
    1. tarefas ativas do dependente (`PENDING/IN_PROGRESS/NOT_DELIVERED`) → delete;
    2. tarefas `COMPLETED/APPROVED` da casa → **MANTIDAS** (histórico da casa),
       com `assigned_to`/`completed_by` → `null` (desatribui a pessoa);
    3. resgates do dependente (pendentes e resolvidos) → delete (`profile_id` NOT
       NULL; a recompensa em si permanece);
    4. sugestões do dependente → delete;
    5. notificações (`recipient_id`) e push subscriptions do dependente → delete;
    6. arquivos dele no Storage (avatar + `messages/<id>/`) → **best-effort**
       (`deleteMemberStorage`), falha não derruba a ação;
    7. membresias do perfil → delete; perfil (`profiles`) → delete;
    8. `admin.auth.admin.deleteUser(...)` por **último** — se falhar, sobra uma
       conta sem perfil, que não passa nos checks de role (inofensiva).
  - `revalidatePath` para casas/tarefas/recompensas.
- **UI (`houses-manager.tsx`):** para membro **DEPENDENT** (visível só ao autor,
  fora da própria linha) o botão vermelho "Expulsar" foi **substituído** por
  **"Excluir conta"** (`Trash2`), com `Modal` de confirmação explícito (o aviso
  deixa claro que o histórico da casa é preservado e a ação é irreversível).
  Co-ADMINs seguem com "Expulsar" (conta de ADMIN não é excluída).

## Consequências
- O banco deixa de acumular perfis órfãos de dependentes; excluir um libera o
  `username` e encerra o acesso real (auth + perfil).
- O **histórico da casa é preservado** para tarefas (statement do ADR-0007/0008:
  o histórico pertence à casa); resgates resolvidos do dependente são perdidos —
  trade-off aceito por não haver coluna nulável para `profile_id` sem migração.
- Sem mudança de schema: tudo coberto por colunas/ordens existentes. Migração
  (`reward_redemptions.profile_id` → `on delete set null`) fica como evolução
  opcional se algum dia o log de resgates do excluído precisar ser retido.
- Excluir é **permanente**: usuário exposto a `deploy` + confirmação em modal.
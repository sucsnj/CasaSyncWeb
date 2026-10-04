# ADR-0023: Permissões por cargo e comprovação por foto ficam fora do escopo

**Status:** aceito — **Data:** 2026

## Contexto
Ao mapear o que mais poderia entrar nas configurações por casa, surgiram duas
sugestões com valor real:

1. **Permissões por cargo** (`permissions`): hoje a distinção autor/co-gestor é
   fixa no código — expulsar, excluir conta, trocar PIN, excluir casa e redefinir
   senha de terceiro exigem `houses.owner_id`, enquanto aprovar tarefa, alterar
   pontos, aplicar castigo e **mudar qualquer configuração** valem para qualquer
   `house_members.role='ADMIN'` (ADR-0011/0012/0014). Numa casa com 2–3 tutores o
   principal não tem como impedir que o co-gestor mexa em pontos/configurações.
2. **Comprovação por foto** (`task_proof`): o upload de imagem em tarefas está
   **desligado** (decisão de produto de 2026, para não inflar storage) e a coluna
   `tasks.image_url` ficou órfã; a sugestão era um toggle por casa que
   reativasse o recurso só onde a família quiser.

## Decisão
**Nenhuma das duas entra no produto, por enquanto.** Não é falta de implementação
— é escopo: as regras atuais permanecem como estão, e nenhuma alteração deve ser
feita nesse sentido sem uma nova decisão explícita do usuário.

## Consequências
- **Não criar chave `permissions` nem `task_rules` de autorização, nem
  `task_proof`.** As regras de autorização continuam exatamente como documentadas
  em `AGENTS.md` §4 (autor-only vs. co-gestor) e o upload de tarefas segue
  comentado em `tasks-admin.tsx`.
- Se alguém propor essas duas features no futuro, tratar como **nova discussão de
  produto** — não como pendência técnica nem como "melhoria" pendente.
- Isso **não** é dívida técnica: são escolhas. O mesmo aconteceu com o "máximo de
  adiamentos por tarefa", que ficou fora por decisão de produto até o ADR-0022
  reverter esse estado.
- O motivo de cada uma ajuda a decisão futura:
  - **permissões:** o app já tem casa ativa e co-gerência por PIN, o que resolve o
    caso de uma casa. A granularidade por papel só ganha valor quando houver mais
    de um tutor com responsabilidades diferentes na mesma casa.
  - **comprovação por foto:** o custo é real (storage + upload + validação) e o
    ganho depende do estilo de cada família. Um flag por casa resolveria, mas só
    depois de haver demanda concreta.
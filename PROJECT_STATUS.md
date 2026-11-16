# Estado do Projeto — CasaSync Web

## Status Atual
Migração **SWR/Local-First** (Fases 0–4 + 3.1–3.4) **concluída**. Cache cliente persistido em IndexedDB por tenant (`@tanstack/react-query` + `@tanstack/react-query-persist-client` + `idb-keyval`); telas principais como shells estáticos; dados reais via Server Actions `*-reads.ts` com autorização derivada da sessão; Realtime → invalidação/patch no cache. Ver `docs/adr/0029-tanstack-query-cache-com-persistencia-indexeddb.md` e `docs/architecture.md`.

## Tarefas Futuras
- **Cache Components (Next 16)** — segunda camada SWR: ativação incremental somente se o ADR-0029 for revisado e um novo ADR for aprovado explicitamente. Avaliação existente concluiu **não ativar agora**.
- Monitorar regressões de **`settings` sob uso real** — `settings-admin.tsx` foi a última tela a faze migração; o padrão de 15 tipos de setting permanece complexo.
- **UI regressões humanas** — as telas novas em `src/components/screens/*` e o shell `(app)/layout.tsx` devem ser revisados em Android real (Capacitor) antes de publicar; o banner offline validou no web, mas o fluxo nativo foi corrigido por `@capacitor/network` e ainda não testado em dispositivo físico nesta sessão.
- Sem testes automatizados — adicionar `npm test`/Vitest se regressões começarem a importar; hoje a verificação é `lint → typecheck → build` + uso manual.

# Estado do Projeto — CasaSync Web

## Status Atual
- **Foco:** Arquitetura offline-first (Opção A: wrapper remoto + fila).
- **Concluído:** Fase 0 (idempotência) + Fase 1 (infra cliente: IndexedDB, fila, `/api/sync`, `/api/health`, provider, proxy, logout).
- **Tarefas Pendentes:** Fases 3–6 (SW, UI offline, validação Android, ADR-0029).

## Concluído
- **Offline — Fase 0 (idempotência):** tabela `app_operations` (`docs/sql/app_operations.sql`), helper `withIdempotency` (`src/lib/idempotency.ts`) e `operationId` opcional em 14 ações de tarefas/recompensas. Sem UI ainda; ações sem `operationId` seguem inalteradas.
- **Offline — Fase 1 (infra cliente):** IndexedDB `casasync-pwa` v1 (`snapshot`/`outbox`/`meta`), fila com `flushQueue` (batch 20, timeout 10s, lock `inFlight`, max 3 tentativas), `submitOrQueue` (gera `operationId` antes da tentativa online), `useOnline` (heartbeat `/api/health` 30s + visibility), `OfflineProvider` (banner + Sincronizar + flush automático + `router.refresh()` pós-flush + toasts), `/api/health` (204 no-store) e `/api/sync` (POST, 401 JSON sem sessão, dispatch sequencial). `clearOfflineData()` no logout; proxy exclui `/api/health` do matcher e responde 401 JSON em `/api/*`. Sem migração dos call sites (Fase 4).
- **Offline — Fase 2 (snapshot de leitura):** rota `/api/offline/snapshot` (GET) com dados de `/tasks` e `/rewards` por casa/role; `refreshOfflineSnapshot()` no cliente (grava IndexedDB + meta); `useOfflineSnapshot` (leitura + staleness 12h); atualização automática no `OfflineProvider` (montagem/online/visibility). Sem UI de leitura offline ainda (Fase 5).
- **Android (Capacitor 8):** projeto `android/` gerado e APK debug validado. Wrapper remoto apontando para `https://casa-sync-web.vercel.app`, package `br.com.casasync.app`. Shell nativo (SystemBars edge-to-edge, splash, botão voltar), safe areas no cabeçalho/bottom nav, fallback offline e Web Push/SW desligados no APK. Ver ADR-0028 e a seção "Android (Capacitor)" no README.
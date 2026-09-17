# ADR-0005: Imagens em Storage público com `<img>` (sem `next/image`)

**Status:** aceito · **Data:** edição completa ADMIN + uploads

## Contexto
Arquivos (avatars, casas, recompensas, tarefas, sugestões) vivem em bucket público do Supabase Storage com URLs públicas.

## Decisão
- Bucket público `casasync-media`, pastas avatars/houses/rewards/tasks/suggestions.
- Helper `src/utils/media.ts` (`uploadMedia`) + componente `ImageUpload` (prévia, remover, estado de envio), reutilizado em 6 lugares.
- Cards usam `<img>` diretamente com a URL pública — **não** `next/image`.

## Consequências
- `npm run lint` emite warnings `no-img-element` **esperados** — não trocar por `next/image` (imagens são URLs dinâmicas de Storage, não estáticas otimizáveis).
- `houses`, `tasks` e `rewards` ganharam `image_url`; `reward_suggestions` tem a sua também.
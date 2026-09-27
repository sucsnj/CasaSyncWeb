# ADR-0005: Imagens em Storage público com `<img>` (sem `next/image`)

**Status:** aceito · **Data:** edição completa ADMIN + uploads

## Contexto
Arquivos (avatars, casas, recompensas, tarefas, sugestões) vivem em bucket público do Supabase Storage com URLs públicas.

## Decisão
- Bucket público `casasync-media`, pastas avatars/houses/rewards/tasks/suggestions.
- Helper `src/utils/media.ts` (`uploadMedia`) + componente `ImageUpload` (prévia, remover, estado de envio), reutilizado em 6 lugares.
- Cards usam `<img>` diretamente com a URL pública — **não** `next/image`.

## Consequências
- A regra `@next/next/no-img-element` está **desligada no `eslint.config.mjs`**
  (decisão de 2026): as imagens são URLs dinâmicas de Storage, não estáticas
  otimizáveis, e a regra só emitia warnings nos 13 arquivos que as renderizam.
  O `<img>` segue sendo o padrão — não trocar por `next/image` sem antes
  configurar `images.remotePatterns` e reativar a regra.
- `npm run lint` roda com `--max-warnings 0`: o lint deve terminar em 0 warnings.
- `houses`, `tasks` e `rewards` ganharam `image_url`; `reward_suggestions` tem a sua também.
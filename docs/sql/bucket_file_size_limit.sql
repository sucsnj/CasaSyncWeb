-- Teto de arquivo do bucket `casasync-media` (ADR-0027).
--
-- Rodar no SQL Editor do Supabase. **Seguro para rodar mais de uma vez** e antes
-- ou depois do deploy do código: só restringe o que ainda não foi enviado.
--
-- O que muda:
--   storage.buckets.file_size_limit = 5242880 (5 MB)
--
-- 5 MB é o mesmo teto que o app já usava para anexo de tarefa, anexo do baú e
-- mensagem rápida (`MEDIA_FILE_MAX_MB` em `src/utils/media.ts`). Como o bucket é
-- único para todas as pastas, o limite aqui é **global**: também vale para foto
-- de perfil, casa, recompensa, sugestão e imagem de conquista. O `ImageUpload`
-- passou a recusar acima disso **antes** de enviar (mensagem boa em vez do erro
-- cru do Storage), e as actions de anexo conferem o tamanho real do objeto antes
-- de gravar a referência (o `file_size_limit` protege o upload, não o
-- `image_url` que o cliente manda para o banco).
--
-- `allowed_mime_types` fica **intencionalmente nulo**: o bucket é compartilhado
-- por pastas com MIME diferentes (imagem, vídeo, PDF, HTML) e qualquer lista
-- fechada aqui quebraria uploads que hoje funcionam. A lista fechada do anexo
-- continua no servidor (`TASK_ATTACHMENT_TYPES`).

update storage.buckets
set file_size_limit = 5242880
where id = 'casasync-media';

-- Confirmação: deve voltar 5242880 (ou null se o UPDATE não casou com o id).
select id, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'casasync-media';


-- ---------------------------------------------------------------------------
-- Opcional: apagar a configuração antiga de "Limite do baú" (`chest_rules.maxItems`),
-- que foi **substituída** por `attachment_budget.maxMb` (mesma chave nova do
-- `house_settings`, jsonb). A linha antiga ficou inerte — nada mais lê
-- `chest_rules` — então o DELETE é só higiene. Não quebra nada se rodar depois.
-- ---------------------------------------------------------------------------

-- delete from public.house_settings where key = 'chest_rules';
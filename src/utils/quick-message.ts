/**
 * Regras do padrão "mensagem rápida" (DEPENDENT → ADMIN da casa).
 * Arquivo sem dependências de servidor para ser importado por cliente e server.
 */
export const QUICK_MESSAGE_MAX_CHARS = 100
export const QUICK_MESSAGE_MAX_IMAGE_MB = 5
export const QUICK_MESSAGE_MAX_IMAGE_BYTES =
  QUICK_MESSAGE_MAX_IMAGE_MB * 1024 * 1024
/** Máximo de mensagens próprias acumuladas (lidas ou não) para poder enviar. */
export const QUICK_MESSAGE_CAPACITY = 2
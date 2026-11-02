/**
 * Heartbeat barato para o detector de "online real" (`useOnline`).
 * Fora do proxy (ver matcher em `src/proxy.ts`): nao precisa de sessao.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  return new Response(null, {
    status: 204,
    headers: { 'Cache-Control': 'no-store' },
  })
}

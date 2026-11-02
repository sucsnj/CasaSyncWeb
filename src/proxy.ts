import type { NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public assets (svg, png, jpg, jpeg, gif, webp, js, json, webmanifest)
     *   — inclui /sw.js e /manifest.webmanifest (PWA) que precisam chegar
     *     íntegros à engine de instalação mesmo sem sessão.
     * - api/health (heartbeat do detector de online): público e sem sessão.
     *   /api/sync continua passando pelo proxy para responder 401 JSON.
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp|js|json|webmanifest)$).*)',
  ],
}
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      return NextResponse.redirect(
        `${requestUrl.origin}/login?error=auth_callback`
      )
    }
  }

  // `/` é protegido e o proxy.ts redireciona para o dashboard
  // correto com base na user_role do usuário.
  return NextResponse.redirect(requestUrl.origin)
}
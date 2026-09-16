import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/types/database'

const PUBLIC_PATHS = ['/login', '/register', '/auth']

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
}

function dashboardForRole(role: Database['public']['Enums']['user_role'] | undefined): string | null {
  if (role === 'ADMIN') return '/dashboard/admin'
  if (role === 'DEPENDENT') return '/dashboard/dependent'
  return null
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out and insecure.

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  // Nenhum usuário autenticado: apenas rotas públicas são permitidas.
  if (!user) {
    if (isPublicPath(pathname)) {
      return supabaseResponse
    }

    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirectedFrom', pathname)
    return NextResponse.redirect(url)
  }

  // Usuário autenticado: resolve a role para guiar os redirecionamentos.
  const { data: profile } = await supabase
    .from('profiles')
    .select('user_role')
    .eq('id', user.id)
    .maybeSingle()

  const role = profile?.user_role
  const dashboard = dashboardForRole(role)

  // Página inicial: encaminha para o dashboard da role.
  if (pathname === '/') {
    if (dashboard) {
      return NextResponse.redirect(new URL(dashboard, request.url))
    }
    return supabaseResponse
  }

  // Rotas públicas: usuário já autenticado vai direto para o dashboard.
  if (isPublicPath(pathname)) {
    if (dashboard) {
      return NextResponse.redirect(new URL(dashboard, request.url))
    }
    return supabaseResponse
  }

  // Proteção das rotas de dashboard por role.
  if (pathname.startsWith('/dashboard/admin') && role !== 'ADMIN') {
    if (dashboard) {
      return NextResponse.redirect(new URL(dashboard, request.url))
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (pathname.startsWith('/dashboard/dependent') && role !== 'DEPENDENT') {
    if (dashboard) {
      return NextResponse.redirect(new URL(dashboard, request.url))
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is. If
  // you're creating a new response object with NextResponse.next() make sure
  // to:
  // 1. Pass the request in it, like so: NextResponse.next({ request })
  // 2. Copy over the cookies, like so: supabaseResponse.cookies.getAll()
  // otherwise the newly created response object won't have the correct cookies.

  return supabaseResponse
}
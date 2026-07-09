import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: 'ketzal' },
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname
  // OJO: '/cotizacion/' con diagonal final — '/cotizaciones' (lista interna) debe seguir protegida.
  // '/recuperar' es pública (usuario sin sesión pide el reset). '/nueva-password'
  // NO va aquí: se llega con la sesión de recuperación ya creada por /auth/callback.
  const isPublic =
    path.startsWith('/login') ||
    path.startsWith('/auth') ||
    path.startsWith('/cotizacion/') ||
    path.startsWith('/recuperar')
  if (!user && !isPublic) {
    const url = request.nextUrl.clone(); url.pathname = '/login'; return NextResponse.redirect(url)
  }
  if (user && path.startsWith('/login')) {
    const url = request.nextUrl.clone(); url.pathname = '/dashboard'; return NextResponse.redirect(url)
  }
  return response
}
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}

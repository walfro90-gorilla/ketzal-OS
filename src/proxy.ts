import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isAdminRole, isAdminRoute } from '@/lib/access'

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
    path.startsWith('/entrar') || // entrada del viajero (comprador B2C): entrar o crear cuenta
    path.startsWith('/auth') ||
    path.startsWith('/cotizacion/') ||
    path.startsWith('/estado/') || // estado de cuenta del cliente (link público por token)
    path.startsWith('/recibo/') || // recibo del cliente (público por uuid del recibo)
    path === '/explora' ||
    path.startsWith('/explora/') || // catálogo público (marketplace)
    path.startsWith('/servicio/') || // ficha pública de un servicio (marketplace)
    path === '/agencias' || // directorio público de agencias (marketplace)
    path.startsWith('/agencia/') || // perfil público de una agencia (marketplace)
    path.startsWith('/comprar/') || // compra en línea (el visitante sin sesión se registra aquí)
    path.startsWith('/recuperar') ||
    path.startsWith('/api/') // endpoints (p.ej. webhook de Mercado Pago) manejan su propia auth
  if (!user && !isPublic) {
    const url = request.nextUrl.clone(); url.pathname = '/login'; return NextResponse.redirect(url)
  }
  if (user && (path.startsWith('/login') || path.startsWith('/entrar'))) {
    // '/' resuelve el aterrizaje por persona (agente → dashboard, viajero → mis-compras).
    const url = request.nextUrl.clone(); url.pathname = '/'; return NextResponse.redirect(url)
  }
  // Rutas de administración (catálogo, comisiones, equipo): solo admin/superadmin.
  // El rol se consulta SOLO al entrar a una ruta admin (no en cada request).
  if (user && isAdminRoute(path)) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (!isAdminRole(profile?.role)) {
      // '/' resuelve por persona: el agente no-admin cae en /dashboard, el viajero
      // en /mis-compras (sin el salto extra vía /dashboard).
      const url = request.nextUrl.clone(); url.pathname = '/'; return NextResponse.redirect(url)
    }
  }
  return response
}
export const config = {
  // Assets PWA públicos (manifest + íconos generados por next/og): deben servirse
  // sin sesión para que la app sea instalable. `icon` cubre /icon y /icons/*.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest\\.webmanifest|icon|apple-icon|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

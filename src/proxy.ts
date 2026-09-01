import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isAdminRole, isAdminRoute } from '@/lib/access'
import {
  normalizarCodigoReferido,
  REF_COOKIE,
  REF_COOKIE_MAX_AGE,
} from '@/lib/domain/embajador'

export async function proxy(request: NextRequest) {
  // b082 — ATRIBUCIÓN DEL EMBAJADOR. El `?ref` se guarda en cookie en el PRIMER
  // aterrizaje, sea cual sea la página. Antes solo viajaba en la query string,
  // hop a hop, y se respaldaba recién al llegar a `/comprar` con sesión: se
  // perdía al tocar cualquiera de los ~10 links que no lo propagan (el logo, el
  // footer, "← Todos los viajes", la ficha de una agencia, "Entrar"), al
  // registrarse con confirmación de correo, o al volver al día siguiente. Y con
  // él se perdía la comisión de quien trajo la venta.
  //
  // Se escribe SOLO si el request trae `?ref`: esa petición ya tiene su propia
  // query key en el CDN, así que ninguna respuesta cacheada de una URL limpia
  // se lleva un `Set-Cookie`.
  //
  // LAST-touch a propósito (ADR-0031): el último link gana. Se valida con el
  // MISMO normalizador que la BD para no guardar basura.
  const refCrudo = request.nextUrl.searchParams.get('ref')
  const refParsed = refCrudo ? normalizarCodigoReferido(refCrudo) : null
  const ref = refParsed && 'code' in refParsed ? refParsed.code : null
  // Se pone también en el request para que el render de ESTA misma petición ya
  // lo vea (mismo patrón que usa el cliente de Supabase abajo).
  if (ref) request.cookies.set(REF_COOKIE, ref)

  /** Aplica el `Set-Cookie` del ref a cualquier respuesta que salga de aquí. */
  const conRef = (res: NextResponse) => {
    if (ref) {
      res.cookies.set(REF_COOKIE, ref, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: REF_COOKIE_MAX_AGE,
      })
    }
    return res
  }

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
    path === '/' || // landing de marca (anónimo). Con sesión, page.tsx redirige por persona.
    path.startsWith('/login') ||
    path.startsWith('/entrar') || // entrada del viajero (comprador B2C): entrar o crear cuenta
    path.startsWith('/auth') ||
    path.startsWith('/cotizacion/') ||
    path.startsWith('/estado/') || // estado de cuenta del cliente (link público por token)
    path.startsWith('/recibo/') || // recibo del cliente (público por uuid del recibo)
    path.startsWith('/voucher/') || // voucher de servicio (público por uuid del voucher)
    path === '/explora' ||
    path.startsWith('/explora/') || // catálogo público (marketplace)
    path.startsWith('/servicio/') || // ficha pública de un servicio (marketplace)
    path.startsWith('/opina/') || // encuesta de investigación de mercado (tráfico de Meta Ads)
    path === '/agencias' || // directorio público de agencias (marketplace)
    path.startsWith('/agencia/') || // perfil público de una agencia (marketplace)
    path.startsWith('/comprar/') || // compra en línea (el visitante sin sesión se registra aquí)
    path === '/politica-cancelacion' || // política de cancelación (texto legal público)
    path.startsWith('/recuperar') ||
    path === '/sw.js' || // service worker (b036): el navegador lo re-fetchea sin contexto de página
    path === '/robots.txt' || // SEO/AEO (ADR-0026): sin esto los crawlers caen en /login
    path === '/sitemap.xml' ||
    path === '/llms.txt' ||
    path.startsWith('/api/') // endpoints (p.ej. webhook de Mercado Pago) manejan su propia auth
  if (!user && !isPublic) {
    const url = request.nextUrl.clone(); url.pathname = '/login'; return conRef(NextResponse.redirect(url))
  }
  if (user && (path.startsWith('/login') || path.startsWith('/entrar'))) {
    // '/' resuelve el aterrizaje por persona (agente → dashboard, viajero → mis-compras).
    const url = request.nextUrl.clone(); url.pathname = '/'; return conRef(NextResponse.redirect(url))
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
      const url = request.nextUrl.clone(); url.pathname = '/'; return conRef(NextResponse.redirect(url))
    }
  }
  return conRef(response)
}
export const config = {
  // Assets PWA públicos (manifest + íconos generados por next/og): deben servirse
  // sin sesión para que la app sea instalable. `icon` cubre /icon y /icons/*.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest\\.webmanifest|icon|apple-icon|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

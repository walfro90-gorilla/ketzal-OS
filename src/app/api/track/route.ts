import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

// Funnel del marketplace (ADR-0025). Endpoint público sin sesión: barato (un
// insert), append-only y sin PII. La tabla funnel_events es deny-all — solo
// este handler (service role) escribe; nadie lee por REST.
// Validación por allowlist a mano (el repo no usa zod): lo que no está en la
// lista, se stripea o se rechaza.

const EVENTOS = new Set(['checkout_open', 'order_created', 'pago_metodo', 'link_click'])
// Mismo formato que valida la BD para un código de referido (m010): lo que no
// cuadre se descarta en vez de guardarse, para que nadie use `meta` de buzón.
const REF_RE = /^[A-Z0-9_-]{3,32}$/
const METODOS = new Set(['mp', 'spei'])
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// b088 · El barrido encontró este endpoint sin ningún tope: escribe con service
// role, sin sesión, y cualquiera podía inflar `funnel_events` con service_id y
// booking_id inventados hasta envenenar la atribución del marketplace.
// ponytail: contador en memoria del proceso. Con Fluid Compute las instancias
// se reusan, así que frena el abuso desde una IP sin infra nueva — pero NO es
// un límite global: varias instancias = varias cuotas. Si algún día importa de
// verdad, esto se cambia por Vercel BotID/WAF, que sí cuenta en el borde.
const VENTANA_MS = 60_000
const TOPE_POR_VENTANA = 60
const vistos = new Map<string, { n: number; hasta: number }>()

function pasaElTope(ip: string): boolean {
  const ahora = Date.now()
  const v = vistos.get(ip)
  if (!v || ahora > v.hasta) {
    // Barrer lo vencido aquí evita que el Map crezca sin fin en una instancia
    // de vida larga (no hay cron ni timer en una función).
    if (vistos.size > 5_000) {
      for (const [k, val] of vistos) if (ahora > val.hasta) vistos.delete(k)
    }
    vistos.set(ip, { n: 1, hasta: ahora + VENTANA_MS })
    return true
  }
  v.n += 1
  return v.n <= TOPE_POR_VENTANA
}

function uuidONull(v: unknown): string | null {
  return typeof v === 'string' && UUID_RE.test(v) ? v : null
}

export async function POST(req: Request) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'desconocida'
  if (!pasaElTope(ip)) return new NextResponse(null, { status: 429 })

  const body = (await req.json().catch(() => null)) as {
    session_id?: unknown
    event?: unknown
    service_id?: unknown
    booking_id?: unknown
    metodo?: unknown
    ref?: unknown
  } | null

  const sessionId = typeof body?.session_id === 'string' ? body.session_id : ''
  const event = typeof body?.event === 'string' ? body.event : ''
  if (sessionId.length < 8 || sessionId.length > 64 || !EVENTOS.has(event)) {
    return new NextResponse(null, { status: 400 })
  }
  const metodo =
    typeof body?.metodo === 'string' && METODOS.has(body.metodo) ? body.metodo : null
  const refCrudo =
    typeof body?.ref === 'string' ? body.ref.trim().toUpperCase() : null
  const ref = refCrudo && REF_RE.test(refCrudo) ? refCrudo : null

  const svc = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (svc as any).from('funnel_events').insert({
    session_id: sessionId,
    event,
    service_id: uuidONull(body?.service_id),
    booking_id: uuidONull(body?.booking_id),
    meta: { ...(metodo ? { metodo } : {}), ...(ref ? { ref } : {}) },
  })
  if (error) {
    // Log corto: nunca el payload completo.
    console.error('[track] insert falló:', error.code || error.message)
    return new NextResponse(null, { status: 500 })
  }
  return new NextResponse(null, { status: 204 })
}

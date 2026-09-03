// Confirmación de correo: el enlace tiene que entrar desde OTRO navegador.
//
// Por qué existe: el 2026-09-03 se prendió "Confirm email" en Auth y la suite
// siguió en verde — porque las 24 fixtures crean cuentas con
// `email_confirm: true` por la Admin API. Ninguna tocaba el camino que el
// switch cambió: `registrarComprador` (src/app/comprar/actions.ts) llama
// `signUp()`, y a partir de ahí el usuario solo entra si el enlace del correo
// funciona. Un harness que no ejerce el camino afectado no es evidencia de nada.
//
// El invariante que defiende es el de b091: la confirmación se verifica en el
// SERVIDOR por `token_hash`, así que no depende del navegador donde se pidió el
// correo. Ese es el caso real de este producto — el prospecto se registra en el
// webview de WhatsApp y abre el correo en la app de Gmail. La otra mitad (PKCE
// `?code=`) sí depende de una cookie local: aquí se verifica que cuando ese
// código no sirve, se degrada a /login?error=auth y NO abre sesión.
//
// No manda un solo correo: `admin/generate_link` fabrica el enlace y lo
// devuelve. Cero cuota gastada, cero buzón involucrado.
//
// El harness corre igual con la confirmación ON u OFF, y reporta cuál está
// viva: `generate_link` funciona en los dos modos, y los enlaces que emite se
// verifican igual. Lo que se rompería si alguien toca /auth/callback se rompe
// aquí en los dos casos.
//
//   pnpm build && pnpm start -p 3100
//   APP=http://localhost:3100 node --env-file=.env.local supabase/tests/confirmacion_email.mjs

import { randomUUID } from 'node:crypto'
import { PREFIJO } from './_fixtures.mjs'

const U = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SK = process.env.SUPABASE_SERVICE_ROLE_KEY
const APP = process.env.APP ?? 'http://localhost:3000'

if (!U || !ANON || !SK) {
  console.error('Faltan claves de Supabase. Corre con: node --env-file=.env.local')
  process.exit(1)
}

let ok = 0, fallos = 0
const check = (n, c, d = '') => {
  if (c) { ok++; console.log(`   ✔ ${n}`) }
  else { fallos++; console.error(`   ✘ ${n}${d ? ` — ${d}` : ''}`) }
}

const admin = () => ({ apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json' })
const corrida = randomUUID().slice(0, 8)
const creados = []

/** Fabrica el usuario y su enlace de confirmación SIN mandar correo. */
async function enlaceDeAlta(sufijo) {
  const email = `${PREFIJO}confirm.${sufijo}.${corrida}@ketzal.local`
  // `redirect_to` va PLANO. Anidado en `options` (la forma del cliente JS) el
  // endpoint REST lo ignora en silencio y devuelve el Site URL — una tarde
  // entera creyendo que la allowlist estaba mal configurada.
  const r = await fetch(`${U}/auth/v1/admin/generate_link`, {
    method: 'POST', headers: admin(),
    body: JSON.stringify({
      type: 'signup', email, password: `${randomUUID()}${randomUUID()}`,
      redirect_to: `${APP}/auth/callback`,
    }),
  })
  if (!r.ok) throw new Error(`generate_link ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const j = await r.json()
  const id = j.user?.id ?? j.id
  // Sin id no hay a quién borrar: reventar aquí es mejor que dejarlo vivo en
  // producción. (Ya pasó: un DELETE a /admin/users/undefined dio 404 y se leyó
  // como limpieza exitosa.)
  if (!id) throw new Error(`generate_link no devolvió el id del usuario: ${JSON.stringify(j).slice(0, 200)}`)
  creados.push({ id, email })
  return { email, id, hash: j.hashed_token }
}

const callback = (qs) =>
  fetch(`${APP}/auth/callback?${qs}`, { redirect: 'manual' })

const destino = (r) => {
  const l = r.headers.get('location')
  return l ? new URL(l, APP) : null
}

console.log('\n▸ Confirmación de correo (enlace desde otro navegador)\n')

try {
  // ── 0. Qué modo está vivo ────────────────────────────────────────────────
  // El harness no supone el modo: lo lee. Con `mailer_autoconfirm: true` la
  // confirmación está APAGADA (el usuario entra sin enlace); con false, PRENDIDA.
  const rs = await fetch(`${U}/auth/v1/settings`, { headers: { apikey: ANON } })
  const cfg = rs.ok ? await rs.json() : null
  check('Auth reporta su configuración de correo',
    typeof cfg?.mailer_autoconfirm === 'boolean', `settings ${rs.status}`)
  if (cfg) {
    console.log(`     · confirmación de correo: ${cfg.mailer_autoconfirm ? 'APAGADA' : 'PRENDIDA'}`)
    console.log(`     · alta pública: ${cfg.disable_signup ? 'CERRADA' : 'abierta'}`)
  }

  // ── 1. token_hash: el camino que no depende del navegador ────────────────
  const a = await enlaceDeAlta('a')
  check('generate_link entrega el token_hash', Boolean(a.hash))

  // Sin una sola cookie: es literalmente otro navegador.
  const r1 = await callback(`type=signup&token_hash=${a.hash}&next=%2Fmis-compras`)
  const d1 = destino(r1)
  check('el enlace por token_hash entra desde otro navegador',
    d1?.pathname === '/mis-compras', `${r1.status} → ${d1?.href ?? 'sin Location'}`)

  const ru = await fetch(`${U}/auth/v1/admin/users/${a.id}`, { headers: admin() })
  const usuario = ru.ok ? await ru.json() : {}
  check('la cuenta queda confirmada en Auth', Boolean(usuario.email_confirmed_at),
    `email_confirmed_at=${usuario.email_confirmed_at ?? 'null'}`)

  // ── 2. El token es de un solo uso ────────────────────────────────────────
  const r2 = await callback(`type=signup&token_hash=${a.hash}&next=%2Fmis-compras`)
  const d2 = destino(r2)
  check('reusar el token no vuelve a abrir sesión',
    d2?.pathname === '/login' && d2.searchParams.get('error') === 'auth',
    `${r2.status} → ${d2?.href ?? 'sin Location'}`)

  // ── 3. PKCE ajeno: degrada, no revienta ──────────────────────────────────
  // El enlace de la plantilla POR DEFECTO usa `?code=` (PKCE), que necesita la
  // cookie `code_verifier` del navegador donde se pidió. Desde otro no puede
  // entrar — lo que sí es obligatorio es que se caiga limpio: nada de 500 y
  // ninguna cookie de sesión emitida.
  const r3 = await callback(`code=${randomUUID()}`)
  const d3 = destino(r3)
  const cookies = r3.headers.getSetCookie?.() ?? []
  check('un código PKCE que no sirve aterriza en /login?error=auth',
    d3?.pathname === '/login' && d3.searchParams.get('error') === 'auth' && r3.status < 400,
    `${r3.status} → ${d3?.href ?? 'sin Location'}`)
  check('y no emite cookie de sesión',
    !cookies.some((c) => /^sb-.*auth-token/.test(c)), cookies.join(' | ').slice(0, 120))

  // ── 4. El ?next no abre un redirect a otro dominio ───────────────────────
  for (const [etiqueta, next] of [['//dominio-ajeno', '//evil.example.com'],
                                  ['https://ajeno', 'https://evil.example.com/x']]) {
    const b = await enlaceDeAlta(`next.${etiqueta.replace(/[^a-z]/gi, '')}`)
    const r = await callback(`type=signup&token_hash=${b.hash}&next=${encodeURIComponent(next)}`)
    const d = destino(r)
    // Comprobar solo el host es demasiado flojo: la ruta se arma como
    // `${origin}${next}`, así que hasta un `next` sucio conserva el host
    // (`http://localhost:3100//evil.example.com`). Lo que la sanitización de
    // verdad garantiza es que el destino sea el fallback interno — eso se mide.
    check(`?next=${etiqueta} cae al destino interno, no al ajeno`,
      d?.host === new URL(APP).host && d?.pathname === '/mis-compras',
      `${r.status} → ${d?.href ?? 'sin Location'}`)
  }
} catch (e) {
  fallos++
  console.error(`   ✘ el harness reventó: ${String(e.message ?? e).split('\n')[0]}`)
} finally {
  // ── Limpieza verificada, no supuesta ──────────────────────────────────────
  for (const c of creados) {
    const r = await fetch(`${U}/auth/v1/admin/users/${c.id}`, { method: 'DELETE', headers: admin() })
    if (!r.ok) console.error(`   ✘ no se borró ${c.email}: ${r.status}`)
  }
  const rl = await fetch(`${U}/auth/v1/admin/users?per_page=1000`, { headers: admin() })
  const quedan = rl.ok
    ? ((await rl.json()).users ?? []).filter((u) => u.email?.startsWith(`${PREFIJO}confirm.`))
    : null
  check('limpieza verificada: 0 cuentas efímeras vivas',
    quedan !== null && quedan.length === 0,
    quedan === null ? 'no se pudo listar Auth' : quedan.map((u) => u.email).join(', '))
}

console.log(`\n   ${ok} pasaron, ${fallos} fallaron\n`)
process.exit(fallos ? 1 : 0)

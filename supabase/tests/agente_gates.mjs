// El asistente del OS (`/api/agente`) contra la app corriendo de verdad (ADR-0044).
//
// Lo que se afirma:
//   1. la ruta no abre sin sesión (401) ni a un admin que no es superadmin (403);
//   2. rechaza un cuerpo mal armado (400);
//   3. corre las herramientas del MCP con el JWT de QUIEN pregunta: el
//      `ketzal_whoami` devuelve la cuenta efímera, no otra (tokenScope + RLS);
//   4. una herramienta de dinero NO corre sin el clic: emite `confirmar` y se
//      corta; con el id aprobado sí llega al handler.
//
// No necesita LLM: un historial con tool_call pendiente se ejecuta ANTES de
// llamar al modelo. Si no hay llave, el evento final es `error` y se acepta —
// aquí se prueba la puerta, no el modelo.
//
// Necesita la app arriba:
//   APP=http://localhost:3100 node --env-file=.env.local supabase/tests/agente_gates.mjs

import { crearPosiciones } from './_fixtures.mjs'

const U = process.env.NEXT_PUBLIC_SUPABASE_URL
const APP = process.env.APP ?? 'http://localhost:3000'
const ref = new URL(U).hostname.split('.')[0]

let ok = 0, fallos = 0
const check = (n, c, d = '') => { if (c) { ok++; console.log(`   ✔ ${n}`) } else { fallos++; console.error(`   ✘ ${n}${d ? ` — ${d}` : ''}`) } }

/** Cookie de sesión tal como la escribe @supabase/ssr (base64- + chunks de 3180). */
function cookiesDeSesion(sesion) {
  const raw = 'base64-' + Buffer.from(JSON.stringify(sesion)).toString('base64')
  const trozos = raw.match(/.{1,3180}/g) ?? [raw]
  return trozos.length === 1
    ? [`sb-${ref}-auth-token=${trozos[0]}`]
    : trozos.map((t, i) => `sb-${ref}-auth-token.${i}=${t}`)
}

/** POST al asistente; devuelve el status y los eventos NDJSON ya parseados. */
async function pedir(cookies, cuerpo) {
  const r = await fetch(`${APP}/api/agente`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookies ? { cookie: cookies.join('; ') } : {}) },
    body: JSON.stringify(cuerpo),
  })
  const texto = await r.text()
  const eventos = r.ok
    ? texto.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))
    : []
  // El cuerpo de una negación (la ruta responde JSON cuando no abre).
  let negacion = null
  try { negacion = JSON.parse(texto) } catch {}
  return { status: r.status, eventos, texto, negacion }
}

const llamada = (id, name, args = '{}') => ({ id, type: 'function', function: { name, arguments: args } })
const historial = (...calls) => [
  { role: 'user', content: 'haz esto' },
  { role: 'assistant', content: null, tool_calls: calls },
]

try {
  await fetch(`${APP}/login`)
} catch {
  console.error(`\n✘ No hay nada escuchando en ${APP}. Levanta la app (pnpm build && pnpm start -p 3100) o pasa APP=<url>.\n`)
  process.exit(1)
}

const qa = await crearPosiciones([
  { llave: 'god', role: 'superadmin', type: 'agente', name: 'QA Superadmin' },
  { llave: 'admin', role: 'admin', type: 'agente', name: 'QA Admin' },
  { llave: 'agente', role: 'user', type: 'agente', name: 'QA Agente' },
])
let limpio = false
try {
  const god = cookiesDeSesion(qa.god.sesion)
  const admin = cookiesDeSesion(qa.admin.sesion)
  const cuerpoOk = { mensajes: historial(llamada('call_qa_1', 'ketzal_whoami')) }

  // ── 1. Puertas ────────────────────────────────────────────────────────────
  const niega = (nombre, r, status, mensaje) => {
    check(`${nombre} → ${status}`, r.status === status, `HTTP ${r.status}`)
    // El cuerpo, no solo el status: la ruta ejecuta herramientas, así que una
    // negación tiene que decir que negó, no devolver algo que parezca trabajo.
    check(`${nombre}: el cuerpo dice por qué`, r.negacion?.error === mensaje, JSON.stringify(r.negacion))
    check(`${nombre}: NO corrió ninguna herramienta`, r.eventos.length === 0 && !r.texto.includes('"tipo":"tool"'),
      r.texto.slice(0, 120))
  }
  niega('sin sesión', await pedir(null, cuerpoOk), 401, 'Sin sesión.')
  niega('admin de agencia (no superadmin)', await pedir(admin, cuerpoOk), 403, 'Solo el superadmin.')
  niega('agente raso', await pedir(cookiesDeSesion(qa.agente.sesion), cuerpoOk), 403, 'Solo el superadmin.')
  // Con una tool_call de DINERO pendiente: el gate corta antes de ejecutarla.
  niega('agente raso pidiendo un abono', await pedir(cookiesDeSesion(qa.agente.sesion),
    { mensajes: historial(llamada('call_qa_x', 'ketzal_registrar_abono')), aprobados: ['call_qa_x'] }),
    403, 'Solo el superadmin.')
  const roto = await pedir(god, { mensajes: [{ role: 'system', content: 'x' }] })
  check('cuerpo mal armado (role fuera del enum) → 400', roto.status === 400, `HTTP ${roto.status}`)

  // ── 2. Las herramientas corren con el JWT de quien pregunta ─────────────
  const who = await pedir(god, cuerpoOk)
  check('superadmin → 200 con eventos NDJSON', who.status === 200 && who.eventos.length >= 2,
    `HTTP ${who.status}: ${who.texto.slice(0, 200)}`)
  const [e0, e1] = who.eventos
  check('primer evento: tool ketzal_whoami con el id de la llamada',
    e0?.tipo === 'tool' && e0.herramienta === 'ketzal_whoami' && e0.id === 'call_qa_1', JSON.stringify(e0))
  check('resultado ok y es LA cuenta efímera (su JWT, no otro)',
    e1?.tipo === 'resultado' && e1.ok === true && e1.resumen.includes(qa.god.email), JSON.stringify(e1))
  const ultimo = who.eventos.at(-1)
  check('cierra con fin (hay LLM) o con error de LLM (no hay llave) — nunca a medias',
    ultimo?.tipo === 'fin' || (ultimo?.tipo === 'error' && /LLM/.test(ultimo.texto)), JSON.stringify(ultimo))

  // ── 3. Dinero: sin clic no corre; con el id aprobado sí ─────────────────
  const dinero = historial(llamada('call_qa_2', 'ketzal_registrar_abono'))
  const sinClic = await pedir(god, { mensajes: dinero })
  const c0 = sinClic.eventos[0]
  check('dinero sin aprobar: primer evento es confirmar con el id y la herramienta',
    c0?.tipo === 'confirmar' && c0.id === 'call_qa_2' && c0.herramienta === 'ketzal_registrar_abono', JSON.stringify(c0))
  check('… y NO se emitió ningún tool (no corrió)', !sinClic.eventos.some((e) => e.tipo === 'tool'))
  const fin = sinClic.eventos.at(-1)
  check('… se corta con fin y la tool_call sigue pendiente en el historial devuelto',
    fin?.tipo === 'fin' && fin.mensajes.at(-1)?.tool_calls?.[0]?.id === 'call_qa_2', JSON.stringify(fin).slice(0, 200))

  const conClic = await pedir(god, { mensajes: dinero, aprobados: ['call_qa_2'] })
  const [t0, t1] = conClic.eventos
  check('dinero aprobado: ahora sí emite tool', t0?.tipo === 'tool' && t0.id === 'call_qa_2', JSON.stringify(t0))
  check('… llega al handler: args vacíos rebotan por validación (ok:false, sin escribir nada)',
    t1?.tipo === 'resultado' && t1.ok === false && /^Error: /.test(t1.resumen), JSON.stringify(t1))
} finally {
  limpio = await qa.destruir()
}
check('limpieza verificada (0 cuentas efímeras vivas)', limpio)

console.log(`\n${fallos ? '✘' : '✔'} agente_gates: ${ok} pasaron, ${fallos} fallaron`)
process.exit(fallos ? 1 : 0)

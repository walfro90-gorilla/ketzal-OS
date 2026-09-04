#!/usr/bin/env node
// Corredor de hard-tests. `pnpm hard-test`
//
// Por qué existe: había 22 harness y CI no corría NI UNO. Se corrían de memoria,
// uno por uno, cuando alguien se acordaba — y "alguien se acordaba" es
// exactamente cómo un harness deja de correr sin que nadie se entere. Ya pasó
// tres veces (ADR-0023) y volvió a pasar: `concurrencia.mjs` trae hardcodeada la
// contraseña de unas cuentas QA borradas en agosto y nadie lo notó.
//
// Regla del corredor: **nunca saltarse algo en silencio**. Un harness que no se
// puede correr no es un harness verde: sale como `NO CORRIÓ` con su motivo y el
// proceso termina en rojo igual que si hubiera fallado. Un tablero que miente en
// verde es peor que no tener tablero.
//
//   pnpm hard-test                # todo lo que se pueda
//   pnpm hard-test embajador      # solo los que casen con el texto
//   APP=http://localhost:3100 pnpm hard-test
//
// Contrato de resultado (lo que el corredor sabe leer):
//   · .mjs  → código de salida. 0 = pasó.
//   · .sql  → si NO lanza excepción, pasó. Si lanza, pasa solo cuando el mensaje
//     dice `0 fallaron` / `0 fail` — el patrón de los harness que corren dentro
//     de un DO y terminan en `raise exception` para que Postgres revierta todo.
//   Un .sql que falle de otra forma sale en rojo con su mensaje.

import { readdirSync, existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = join(AQUI, '..', '..')
const APP = process.env.APP ?? 'http://localhost:3000'

// Qué necesita cada harness y qué invariante defiende. Se declara a mano y a
// propósito: adivinarlo desde el código es justo lo que deja pasar un harness
// roto como si estuviera verde.
//   supabase → claves de .env.local        app → la app respondiendo en $APP
//   build    → .next/ (ids de server action)  db → DATABASE_URL
const HARNESS = [
  // ── .mjs ────────────────────────────────────────────────────────────────
  { f: 'superficie_anonima.mjs',          necesita: ['supabase'],                 adr: '0004', afirma: 'el anónimo no lee nada que no sea vitrina pública' },
  { f: 'policy_services_posiciones.mjs',  necesita: ['supabase'],                 adr: '0004', afirma: 'cada posición ve solo los servicios de su agencia' },
  { f: 'encuestas_rls.mjs',               necesita: ['supabase'],                 adr: '0018', afirma: 'el voto anónimo no expone al votante' },
  { f: 'acceso_provisional.mjs',          necesita: ['supabase'],                 adr: '0027', afirma: 'la contraseña provisional entra y obliga a cambiarla' },
  { f: 'invitacion_acceso.mjs',           necesita: ['supabase', 'app'],          adr: '0028', afirma: 'la invitación materializa el perfil; no deja viajeros muertos' },
  { f: 'gate_password_provisional.mjs',   necesita: ['supabase', 'app'],          adr: '0027', afirma: 'los portales no dejan pasar con la contraseña dictada' },
  { f: 'atribucion_ref.mjs',              necesita: ['supabase', 'app'],          adr: '0031', afirma: 'el ?ref sobrevive la navegación y se consume al comprar' },
  { f: 'conversion_portales.mjs',         necesita: ['supabase', 'app'],          adr: '0033', afirma: 'el convertido conserva /mis-compras y la salida a su portal' },
  { f: 'conversion_alta.mjs',             necesita: ['supabase', 'app', 'build'], adr: '0033', afirma: 'un correo con cuenta se convierte en vez de reventar' },
  { f: 'concurrencia.mjs',                necesita: ['supabase'],                 adr: '0008', afirma: 'el cupo no se sobrevende en carrera' },
  { f: 'carreras_dinero.mjs',             necesita: ['supabase'],                 adr: '0006', afirma: 'el ledger aguanta escrituras concurrentes' },
  { f: 'dominio_redirect.mjs',            necesita: ['app'],                      adr: '0040', afirma: 'el host viejo redirige 308 al apex con la query intacta; /api no' },
  { f: 'confirmacion_email.mjs',          necesita: ['supabase', 'app'],          adr: '0039', afirma: 'el enlace de confirmación entra por token_hash desde otro navegador; el ?next no abre redirect' },
  { f: 'expediente_usuario.mjs',          necesita: ['supabase', 'app'],          adr: '0043', afirma: 'el expediente abre también por clic (RSC), y las cuentas efímeras no salen en la lista' },
  { f: 'configuracion_agencia.mjs',       necesita: ['db', 'supabase', 'app'],    adr: '—',    afirma: 'la agencia se configura en /ajustes; /proveedores lista a sus proveedores, no a ella; su ficha redirige' },
  { f: 'agente_gates.mjs',                necesita: ['supabase', 'app'],          adr: '0044', afirma: 'el asistente solo abre al superadmin, corre las tools del MCP con SU JWT y el dinero no corre sin clic' },
  { f: 'paginas_legales.mjs',             necesita: ['app'],                      adr: '—',    afirma: 'el aviso de privacidad y la política de cancelación abren SIN sesión, con su texto' },
  { f: 'aeo_superficie.mjs',              necesita: ['app'],                      adr: '0026', afirma: 'marca, ficha y llms.txt publican hechos citables y ningún JSON-LD está roto' },
  { f: 'home.mjs',                        necesita: ['app'],                      adr: '0046', afirma: 'la home sirve su hero con UNA sola imagen prioritaria, la nav no enlaza al marketplace, responde también por RSC y /styleguide exige sesión' },
  // ── .sql ────────────────────────────────────────────────────────────────
  { f: 'money_invariants.sql',            necesita: ['db'], adr: '0005', afirma: 'el dinero se deriva; los totales cuadran' },
  { f: 'hard_testing_dinero.sql',         necesita: ['db'], adr: '0006', afirma: 'append-only: nadie muta un asiento por REST' },
  { f: 'comisiones_motor.sql',            necesita: ['db'], adr: '0019', afirma: 'la comisión es un asiento, no una columna' },
  { f: 'embajadores_rls.sql',             necesita: ['db'], adr: '0021', afirma: 'un embajador no ve ni cobra lo de otro' },
  { f: 'encuestas_rls.sql',               necesita: ['db'], adr: '0018', afirma: 'las encuestas no filtran al votante' },
  { f: 'embajador_devengo.sql',           necesita: ['db'], adr: '0029', afirma: 'devenga al confirmar, no en draft; auto-referido cerrado' },
  { f: 'corte_embajadores.sql',           necesita: ['db'], adr: '0032', afirma: 'el corte es derivado y no paga dos veces' },
  { f: 'conversion_viajero_embajador.sql',necesita: ['db'], adr: '0033', afirma: 'convertirse no le quita compras, créditos ni voucher' },
  { f: 'superficie_storage.sql',        necesita: ['db'], adr: '0036', afirma: 'el bucket público no guarda comprobantes ni acepta escritura ajena' },
  { f: 'list_ambassadors_alcance.sql',    necesita: ['db'], adr: '0037', afirma: 'el admin de agencia ve a sus embajadores y solo a los suyos' },
  { f: 'cotizacion_reclamada.sql',        necesita: ['db'], adr: '0039', afirma: 'la cotización se guarda con su token, el correo liga solo verificado y la venta manual es solo lectura' },
  { f: 'simulacion_1000_ops.sql',         necesita: ['db'], adr: '0006', afirma: 'los invariantes aguantan volumen' },
  { f: 'volumen_y_clawbot.sql',           necesita: ['db'], adr: '0006', afirma: 'el Clawbot no rompe invariantes a volumen' },
  { f: 'mp_desconectar.sql',              necesita: ['db'], adr: '0042', afirma: 'solo el admin de la agencia (o superadmin) desconecta su MP; la tabla sigue deny-all y queda rastro' },
]

// `qa_setup.sql` y `_fixtures.mjs` no son harness (siembra y utilería).
const NO_SON_HARNESS = new Set(['qa_setup.sql', '_fixtures.mjs', 'correr.mjs'])

// Un archivo nuevo en supabase/tests/ que nadie declaró aquí no puede quedar
// invisible: sale como NO CORRIÓ y obliga a declararlo.
const declarados = new Set(HARNESS.map((h) => h.f))
for (const f of readdirSync(AQUI)) {
  if (NO_SON_HARNESS.has(f) || declarados.has(f)) continue
  if (!/\.(mjs|sql)$/.test(f)) continue
  HARNESS.push({ f, necesita: ['sin-declarar'], adr: '—', afirma: '(sin declarar en correr.mjs)' })
}

// ── Qué está disponible ────────────────────────────────────────────────────
const env = process.env
const tieneSupabase = Boolean(
  env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY,
)
const tieneDb = Boolean(env.DATABASE_URL)
const tieneBuild = existsSync(join(RAIZ, '.next', 'server', 'server-reference-manifest.json'))
let appViva = false
try {
  const r = await fetch(`${APP}/login`, { signal: AbortSignal.timeout(4000) })
  appViva = r.ok || r.status === 307 || r.status === 302
} catch { appViva = false }

const PORQUE = {
  supabase: 'faltan claves de Supabase (corre con --env-file=.env.local)',
  app: `la app no responde en ${APP} (pnpm build && pnpm start -p 3100, y pasa APP=)`,
  build: 'no hay .next/ (corre pnpm build antes)',
  db: 'falta DATABASE_URL en .env.local (cadena de conexión de Postgres)',
  'sin-declarar': 'harness sin declarar en correr.mjs: agrégalo a la tabla HARNESS',
  'qa-setup':
    'depende de qa_setup.sql, cuyas fixtures se borraron el 2026-08-23, y NO revierte: ' +
    'correrlo sembraría datos QA en producción. Portarlo a fixtures efímeras (ADR-0023).',
}
// `qa-setup` nunca está disponible a propósito. Sembrar las agencias QA en
// producción para poder correr un test es peor que no correrlo: es exactamente
// lo que ADR-0023 vino a terminar.
const disponible = {
  supabase: tieneSupabase, app: appViva, build: tieneBuild, db: tieneDb,
  'sin-declarar': false, 'qa-setup': false,
}

// ── Ejecutores ─────────────────────────────────────────────────────────────
function correrMjs(archivo) {
  return new Promise((resolve) => {
    const hijo = spawn(process.execPath, ['--env-file=.env.local', join('supabase', 'tests', archivo)], {
      cwd: RAIZ, env: { ...process.env, APP },
    })
    let salida = ''
    hijo.stdout.on('data', (d) => { salida += d })
    hijo.stderr.on('data', (d) => { salida += d })
    hijo.on('close', (code) => resolve({ ok: code === 0, salida }))
    hijo.on('error', (e) => resolve({ ok: false, salida: e.message }))
  })
}

// Un harness estilo rollback termina SIEMPRE lanzando, para que Postgres
// revierta. Así que la excepción no dice si pasó — lo dice el conteo que trae
// dentro, y cada uno lo redacta a su manera. Estos son los "cero" que existen
// hoy; uno nuevo que no case sale en rojo, que es el default correcto.
const EXITO_EN_EXCEPCION = [
  /\b0 (fallaron|fail)\b/i,      // "6 ok, 0 fail" · "8 pasaron, 0 fallaron"
  /VIOLACIONES \(0\)/i,          // simulacion_1000_ops: "ROLLBACK-OK … VIOLACIONES (0)"
]

// Vocabulario de FRACASO en los harness estilo veredicto. Cada uno inventó el
// suyo y el corredor solo miraba `FALLA:` — así que `embajadores_rls` (ROTO,
// SUCIO, INVALIDO) y `encuestas_rls` (HUECO) salían VERDES con casos rotos
// adentro. `INVALIDO` cuenta como fracaso a propósito: significa que el caso no
// llegó a probar el guard, y un guard sin probar no es un guard verificado.
const VEREDICTO_MALO = /^(FALL(A|Ó)|ROTO|HUECO|SUCIO|INVALIDO|INVÁLIDO)\b/i

/** Celdas que declaran una falla, en cualquiera de los result sets. */
function filasConFalla(res) {
  const sets = Array.isArray(res) ? res : [res]
  const malas = []
  for (const s of sets) {
    for (const fila of s?.rows ?? []) {
      for (const v of Object.values(fila)) {
        if (typeof v === 'string' && VEREDICTO_MALO.test(v.trim())) malas.push(v.trim())
      }
    }
  }
  return malas
}

let cliente = null
let sinConexion = null   // motivo, si la conexión no se pudo abrir
async function correrSql(archivo) {
  if (sinConexion) return { noCorrio: sinConexion }
  if (!cliente) {
    // Que no se pueda conectar NO es un test fallado: es un test que nadie
    // corrió. Distinguirlo importa — si se reporta como fallo, mañana alguien
    // "arregla" el harness en vez de arreglar la conexión.
    try {
      const pg = (await import('pg')).default
      cliente = new pg.Client({ connectionString: env.DATABASE_URL })
      await cliente.connect()
    } catch (e) {
      cliente = null
      sinConexion = `no se pudo conectar con DATABASE_URL: ${String(e.message ?? e).split('\n')[0]}`
      return { noCorrio: sinConexion }
    }
  }
  const sql = await readFile(join(AQUI, archivo), 'utf8')

  // GUARD DURO. Un hard-test corre contra PRODUCCIÓN: si commitea, lo que haga
  // se queda. `embajadores_rls.sql` commiteaba y su limpieza borraba por
  // predicado — el 2026-09-01 se llevó las dos tarifas reales de embajador del
  // fundador. El corredor prefiere no correr un harness a dejarlo escribir.
  if (/^\s*commit\s*;/mi.test(sql)) {
    return { noCorrio: 'trae `commit`: un hard-test tiene que revertir (cámbialo por `rollback`)' }
  }
  // La conexión se reusa entre harness. Un harness que aborta su transacción
  // (un `raise` dentro de un `begin;` sin `rollback`) deja la sesión envenenada
  // y TODOS los siguientes fallan con "current transaction is aborted" — seis
  // falsos rojos por culpa del primero. Se limpia antes de cada uno; si no había
  // transacción abierta, Postgres solo avisa y sigue.
  await cliente.query('rollback').catch(() => {})
  // Y `discard all` porque la sesión también arrastra lo demás: las tablas temp
  // (dos harness crean `temp table qa` ⇒ el segundo moría con "relation qa
  // already exists") y, peor, un `set role authenticated` que quedó colgado de
  // un harness que falló a media — el siguiente correría suplantando a alguien.
  await cliente.query('discard all').catch(() => {})

  // ── El rollback lo pone el CORREDOR, no la buena fe del harness ───────────
  // El guard de `commit` no bastaba. `hard_testing_dinero.sql` traía un
  // `exception when others` que se TRAGABA el error: el bloque `do $$` terminaba
  // normalmente y Postgres commiteó — dejando 2 agencias, 2 cuentas, 6 ventas,
  // 6 clientes y 5 pagos en producción (2026-09-01, segundo escape del día).
  // Un harness "que revierte" solo revierte si de verdad lanza; con esto la
  // transacción la abre y la cierra el corredor, y pase lo que pase adentro, al
  // salir se revierte. Probado con un harness hostil a propósito (escribe y se
  // traga el error): 0 filas escaparon.
  await cliente.query('begin').catch(() => {})
  try {
    const res = await cliente.query(sql)
    // Tercer estilo: los que terminan en `commit` y devuelven una tabla de
    // veredictos ('OK: …' / 'FALLA: …') para que un humano la lea. No lanzan
    // nada al fallar, así que "sin excepción" los daría en VERDE con casos
    // rotos adentro. Se leen las filas.
    const falla = filasConFalla(res)
    if (falla.length) return { ok: false, salida: falla.join(' · ') }
    return { ok: true, salida: 'sin excepción' }   // estilo notice: callar es pasar
  } catch (e) {
    const msg = String(e.message ?? e)
    // Estilo rollback: termina en `raise exception` a propósito para revertir.
    // La excepción NO es el fallo — el fallo es el conteo que trae dentro.
    const paso = EXITO_EN_EXCEPCION.some((re) => re.test(msg))
    return { ok: paso, salida: msg.split('\n').filter(Boolean).slice(0, 2).join(' · ') }
  } finally {
    // Siempre, en los dos caminos: nada de lo que el harness escriba sale de
    // aquí. Si ya no hay transacción abierta, Postgres solo avisa.
    await cliente.query('rollback').catch(() => {})
  }
}

// ── Corrida ────────────────────────────────────────────────────────────────
const filtro = process.argv.slice(2).find((a) => !a.startsWith('-'))
const verboso = process.argv.slice(2).some((a) => a === '-v' || a === '--detalle')
const aCorrer = HARNESS.filter((h) => !filtro || h.f.includes(filtro))

console.log(`\n▸ Hard-tests de Ketzal — ${aCorrer.length} harness\n`)
const resultados = []

for (const h of aCorrer) {
  const falta = h.necesita.filter((n) => !disponible[n])
  if (falta.length) {
    resultados.push({ ...h, estado: 'NO CORRIÓ', nota: PORQUE[falta[0]] })
    console.log(`   … ${h.f} — NO CORRIÓ: ${PORQUE[falta[0]]}`)
    continue
  }
  process.stdout.write(`   · ${h.f} … `)
  const t = Date.now()
  const r = h.f.endsWith('.sql') ? await correrSql(h.f) : await correrMjs(h.f)
  const seg = ((Date.now() - t) / 1000).toFixed(1)
  if (r.noCorrio) {
    resultados.push({ ...h, estado: 'NO CORRIÓ', nota: r.noCorrio })
    console.log(`… NO CORRIÓ: ${r.noCorrio}`)
    continue
  }
  resultados.push({ ...h, estado: r.ok ? 'PASÓ' : 'FALLÓ', nota: r.ok ? '' : ultimaLineaUtil(r.salida) })
  console.log(r.ok ? `✔ ${seg}s` : `✘ ${seg}s`)
  if (!r.ok) console.log(`       ${ultimaLineaUtil(r.salida)}`)
  // En verde el conteo del harness ("11 pasaron, 0 fallaron") no se veía por
  // ningún lado: un ✔ no distingue 11 casos de 1. `-v` lo saca.
  else if (verboso) console.log(`       ${ultimaLineaUtil(r.salida)}`)
}

if (cliente) await cliente.end()

function ultimaLineaUtil(txt) {
  const lineas = String(txt).split('\n').map((l) => l.trim()).filter(Boolean)
  return lineas.reverse().find((l) => /✘|error|Error|fall|exception/i.test(l)) ?? lineas.at(-1) ?? ''
}

// ── Resumen ────────────────────────────────────────────────────────────────
const etiqueta = (r) => (r.adr === '—' ? r.afirma : `ADR-${r.adr}: ${r.afirma}`)
const cuenta = (e) => resultados.filter((r) => r.estado === e).length
const fallaron = resultados.filter((r) => r.estado === 'FALLÓ')
const noCorrieron = resultados.filter((r) => r.estado === 'NO CORRIÓ')

console.log(`\n${'─'.repeat(72)}`)
console.log(`  ${cuenta('PASÓ')} pasaron · ${fallaron.length} fallaron · ${noCorrieron.length} no corrieron`)

if (fallaron.length) {
  console.log('\n  FALLARON — el invariante que defienden está roto o el harness caducó:')
  for (const r of fallaron) console.log(`    ✘ ${r.f}  (${etiqueta(r)})\n        ${r.nota}`)
}
if (noCorrieron.length) {
  console.log('\n  NO CORRIERON — nadie está verificando esto ahora mismo:')
  for (const r of noCorrieron) console.log(`    … ${r.f}  (${etiqueta(r)})\n        ${r.nota}`)
}
// ── Guard del inventario ───────────────────────────────────────────────────
/**
 * ¿El número de hard-tests que declara `CLAUDE.md` coincide con los que hay?
 *
 * Por qué existe: ese número se desincronizó DOS veces en dos días, siempre en
 * silencio. El 2026-09-04 main declaraba 31 con 32 reales; entró en #130, que
 * sumó `home.mjs` a la tabla de aquí abajo sin mover la línea de CLAUDE.md, y
 * lo arrastraron las etapas siguientes. Nadie se entera hasta que alguien lo
 * cuenta a mano.
 *
 * El modo de falla real NO es "alguien escribió mal el número", es "alguien
 * agregó un harness sin saber que había un número que mover". Por eso el
 * mensaje trae los dos valores, de dónde salió cada uno y la línea exacta:
 * tiene que enseñar dónde está el número, no solo avisar que no cuadra.
 *
 * Si no se puede leer o parsear CLAUDE.md, esto AVISA y no falla. Hoy el
 * corredor no depende del repo más allá de `supabase/tests/`, y sería absurdo
 * que el chequeo del inventario impidiera correr las pruebas de dinero.
 */
async function revisarInventario(reales) {
  const ruta = join(RAIZ, 'CLAUDE.md')
  let texto
  try {
    texto = await readFile(ruta, 'utf8')
  } catch (e) {
    return { estado: 'sin-leer', motivo: `no se pudo leer CLAUDE.md (${e.code ?? e.message})` }
  }
  const lineas = texto.split('\n')
  const patron = /\(`supabase\/tests\/`,\s*(\d+)/
  const i = lineas.findIndex((l) => patron.test(l))
  if (i < 0) {
    return {
      estado: 'sin-leer',
      motivo: 'no se encontró en CLAUDE.md la línea con el conteo (`supabase/tests/`, N)',
    }
  }
  const declarado = Number(lineas[i].match(patron)[1])
  if (declarado === reales) return { estado: 'ok', declarado }
  return { estado: 'difiere', declarado, reales, linea: i + 1 }
}

const inventario = await revisarInventario(HARNESS.length)
if (inventario.estado === 'difiere') {
  console.log('  INVENTARIO DESINCRONIZADO — el número de hard-tests no cuadra:')
  console.log(`    · CLAUDE.md declara ${inventario.declarado}   (línea ${inventario.linea})`)
  console.log(`    · aquí hay ${inventario.reales}              (entradas de HARNESS en supabase/tests/correr.mjs)`)
  console.log(`    Corrige la línea ${inventario.linea} de CLAUDE.md para que diga ${inventario.reales}.`)
} else if (inventario.estado === 'sin-leer') {
  // Aviso, no fallo: el inventario no vale una suite caída.
  console.log(`  ⚠ no se pudo verificar el inventario: ${inventario.motivo}`)
}
console.log(`${'─'.repeat(72)}\n`)

// Rojo también si algo no corrió: un invariante sin verificar no es un invariante,
// y también si el inventario miente: un tablero que dice 31 con 32 reales ya está
// mintiendo, aunque los 32 pasen.
process.exit(
  fallaron.length + noCorrieron.length === 0 && inventario.estado !== 'difiere' ? 0 : 1
)

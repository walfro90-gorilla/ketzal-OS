// Fixtures EFÍMERAS para los hard-tests que necesitan JWT real.
//
// Por qué existe: los harness de RLS por HTTP necesitan una cuenta por posición
// (admin de agencia, agente raso, viajero, embajador, proveedor...) porque
// suplantar solo posiciones altas esconde los huecos de las de abajo. La versión
// anterior usaba cuentas PERMANENTES con la contraseña en `KETZAL_QA_PASS`, y eso
// dejaba un dilema sin salida buena:
//
//   - dejarlas vivas ⇒ credenciales de prueba con rol alto en producción. Pasó:
//     `qa.ui@ketzal.local` vivió 6 días con role='superadmin' (2026-08-24 al 30).
//   - borrarlas ⇒ los harness dejan de correr EN SILENCIO. Pasó dos veces:
//     `policy_services_posiciones.mjs` murió con la limpieza del 2026-08-23 y
//     `encuestas_rls.mjs` con la del 2026-08-30.
//
// Aquí las cuentas viven segundos: se crean al arrancar con contraseña aleatoria
// por corrida (nunca impresa, nunca en `.env`), y se borran en un `finally`.
// No queda ninguna credencial entre corridas.
//
// Uso:
//   import { crearPosiciones } from './_fixtures.mjs'
//   const qa = await crearPosiciones([
//     { llave: 'admin', role: 'admin', type: 'agente', supplier_id: BORDER },
//   ])
//   try { ...  qa.admin.token  ... } finally { await qa.destruir() }

import { randomUUID } from 'node:crypto'

// Prefijo exclusivo de las fixtures. El barrido de restos borra por este prefijo,
// así que tiene que ser algo que ninguna cuenta real pueda llevar jamás.
export const PREFIJO = 'qa.efimero.'

const U = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SK = process.env.SUPABASE_SERVICE_ROLE_KEY

function exigirEnv() {
  const faltan = [
    ['NEXT_PUBLIC_SUPABASE_URL', U],
    ['NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON],
    ['SUPABASE_SERVICE_ROLE_KEY', SK],
  ].filter(([, v]) => !v).map(([k]) => k)
  if (faltan.length) {
    console.error(`Faltan en el entorno: ${faltan.join(', ')}`)
    console.error('Corre con: node --env-file=.env.local <harness>')
    process.exit(1)
  }
}

const admin = (extra = {}) => ({
  apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json', ...extra,
})
const rest = (extra = {}) => ({
  apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json',
  'Accept-Profile': 'ketzal', 'Content-Profile': 'ketzal', ...extra,
})

async function listarUsuarios() {
  const r = await fetch(`${U}/auth/v1/admin/users?per_page=1000`, { headers: admin() })
  if (!r.ok) throw new Error(`Admin API list ${r.status}: ${(await r.text()).slice(0, 200)}`)
  return (await r.json()).users ?? []
}

async function borrarUsuario(id) {
  const r = await fetch(`${U}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: admin() })
  if (!r.ok) throw new Error(`Admin API delete ${r.status}: ${(await r.text()).slice(0, 200)}`)
}

/** Borra restos de una corrida que murió a medias (kill -9, excepción sin finally). */
async function barrerRestos() {
  const restos = (await listarUsuarios()).filter((u) => u.email?.startsWith(PREFIJO))
  let tercos = 0
  for (const u of restos) {
    // No tirar la corrida por un resto que no se deja borrar: si tiene pagos o
    // recibos colgando (append-only), el DELETE de auth rebota con 23503 — y
    // antes eso reventaba el harness ENTERO antes de empezar, dejando la suite
    // muerta hasta que alguien limpiara a mano.
    try { await borrarUsuario(u.id) } catch { tercos++ }
  }
  if (restos.length) console.log(`   ⚠ barridos ${restos.length - tercos} restos de una corrida anterior`)
  if (tercos) console.error(`   ⚠ ${tercos} resto(s) no se dejaron borrar: tienen dinero colgando. Límpialos a mano.`)
  return restos.length
}

/**
 * Crea una cuenta de Auth + su `profiles` por cada posición y devuelve sus JWT.
 * `posiciones`: [{ llave, role, type, supplier_id, name }]
 * Devuelve `{ [llave]: { token, id, email, sesion }, destruir() }`.
 * `sesion` es la respuesta completa del password grant: la necesita quien arma
 * la cookie de @supabase/ssr para pedirle rutas al servidor de Next.
 */
export async function crearPosiciones(posiciones) {
  exigirEnv()
  await barrerRestos()

  // Un solo password aleatorio por corrida: nunca se imprime ni se persiste.
  const pass = `${randomUUID()}${randomUUID()}`
  const corrida = randomUUID().slice(0, 8)
  const creadas = []
  const salida = {
    destruir: async () => {
      let quedan = []
      for (const c of creadas) {
        try { await borrarUsuario(c.id) } catch (e) { console.error(`   ✘ no se borró ${c.email}: ${e.message}`) }
      }
      // Verificar, no suponer: si el borrado falló, la cuenta sigue viva en prod.
      try {
        quedan = (await listarUsuarios()).filter((u) => u.email?.startsWith(PREFIJO))
      } catch (e) {
        console.error(`   ✘ no se pudo verificar la limpieza: ${e.message}`)
        return false
      }
      if (quedan.length) {
        console.error(`   ✘ QUEDARON VIVAS ${quedan.length} cuentas efímeras: ${quedan.map((u) => u.email).join(', ')}`)
        return false
      }
      console.log(`   ✔ limpieza verificada: 0 cuentas efímeras vivas`)
      return true
    },
  }

  try {
    for (const p of posiciones) {
      const email = `${PREFIJO}${p.llave}.${corrida}@ketzal.local`

      // Admin API, NUNCA INSERT directo a auth.users: una fila hecha a mano deja
      // NULL en confirmation_token y compañía, y GoTrue los lee como texto no
      // nulable ⇒ toda la Admin API responde 500 "Database error finding users".
      const rc = await fetch(`${U}/auth/v1/admin/users`, {
        method: 'POST', headers: admin(),
        body: JSON.stringify({ email, password: pass, email_confirm: true }),
      })
      if (!rc.ok) throw new Error(`crear ${email}: ${rc.status} ${(await rc.text()).slice(0, 200)}`)
      const { id } = await rc.json()
      creadas.push({ id, email })

      // No hay trigger de signup: el profile se inserta aparte. `active` viene
      // false por default y sin él la cuenta no pasa los guards de la app.
      const rp = await fetch(`${U}/rest/v1/profiles`, {
        method: 'POST', headers: rest({ Prefer: 'return=minimal' }),
        body: JSON.stringify({
          id, email, name: p.name ?? `QA ${p.llave}`,
          role: p.role ?? 'user', type: p.type ?? 'viajero',
          supplier_id: p.supplier_id ?? null, active: true,
        }),
      })
      if (!rp.ok) throw new Error(`profile ${email}: ${rp.status} ${(await rp.text()).slice(0, 200)}`)

      const rl = await fetch(`${U}/auth/v1/token?grant_type=password`, {
        method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass }),
      })
      const sesion = await rl.json()
      if (!sesion.access_token) throw new Error(`login ${email}: ${rl.status}`)

      salida[p.llave] = { token: sesion.access_token, id, email, sesion }
    }
    console.log(`   ✔ ${posiciones.length} posiciones efímeras creadas`)
    return salida
  } catch (e) {
    // Si la creación falla a medias, no dejar cuentas colgadas en producción.
    await salida.destruir()
    throw e
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Escenario de AGENCIA efímero, para los harness que corren por HTTP.
//
// Por qué no basta `crearPosiciones`: una carrera real necesita DOS conexiones
// pegándole a la misma fila, así que se dispara por PostgREST — y lo que escribe
// PostgREST queda COMMITEADO. No hay rollback que valga; hay que borrarlo a
// mano. Estos dos helpers son ese par: crear y borrar, ambos verificando.
//
// `concurrencia.mjs` y `carreras_dinero.mjs` dependían de `qa_setup.sql`
// sembrado a mano y NO limpiaban ("los datos QA se quedan", regla del
// 2026-07-19). Esa regla murió con ADR-0023.

import pg from 'pg'

// Tablas con guard append-only: el DELETE está prohibido por trigger, así que
// para limpiar hay que apagarlo DENTRO de la transacción y volver a encenderlo.
const TABLAS_APPEND_ONLY = ['receipts', 'payments', 'commission_lines', 'system_log']

const conectar = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('Falta DATABASE_URL en .env.local (necesaria para sembrar y limpiar el escenario)')
  }
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await c.connect()
  return c
}

/** Corre `fn(cliente)` con una conexión de Postgres y la cierra siempre. */
export async function conPg(fn) {
  const c = await conectar()
  try { return await fn(c) } finally { await c.end() }
}

/**
 * Crea una agencia QA con (opcionalmente) un servicio y una salida con cupo.
 * Devuelve `{ supplierId, serviceId, departureId }`. Commitea: lo que sigue
 * corre por HTTP y tiene que verlo.
 */
export async function crearEscenario({ cupo = null } = {}) {
  const c = await conectar()
  try {
    const { rows } = await c.query(
      `insert into ketzal.suppliers(name, contact_email, supplier_type, commission_rate)
       values ($1, $2, 'agency', 0) returning id`,
      [`QA Escenario ${randomUUID().slice(0, 8)}`, `qa.escenario.${randomUUID().slice(0, 8)}@ketzal.local`],
    )
    const supplierId = rows[0].id
    const svc = await c.query(
      `insert into ketzal.services(supplier_id, name, price, published)
       values ($1, 'QA Escenario Tour', 1000, false) returning id`, [supplierId])
    const serviceId = svc.rows[0].id
    let departureId = null
    if (cupo != null) {
      const d = await c.query(
        `insert into ketzal.service_departures(service_id, departs_on, max_capacity, seats_taken)
         values ($1, current_date + 60, $2, 0) returning id`, [serviceId, cupo])
      departureId = d.rows[0].id
    }
    return { supplierId, serviceId, departureId }
  } finally {
    await c.end()
  }
}

/**
 * Borra TODO lo que cuelga de una agencia QA y **verifica** que quedó en cero.
 * Las tablas de dinero son append-only: el guard se apaga sólo dentro de esta
 * transacción y se vuelve a encender antes de salir.
 */
export async function borrarEscenario(supplierId) {
  const c = await conectar()
  try {
    await c.query('begin')
    await c.query(`create temp table _bk on commit drop as
      select id from ketzal.bookings
       where selling_supplier_id = $1 or owner_supplier_id = $1`, [supplierId])
    // `commission_lines` va en la lista: olvidarla hacía fallar TODO el borrado
    // (tg_ledger_inmutable prohíbe el DELETE) y el escenario quedaba vivo.
    for (const t of TABLAS_APPEND_ONLY) {
      await c.query(`alter table ketzal.${t} disable trigger user`)
    }
    await c.query(`delete from ketzal.receipts where booking_id in (select id from _bk)
       or payment_id in (select id from ketzal.payments where booking_id in (select id from _bk))`)
    await c.query('delete from ketzal.payments where booking_id in (select id from _bk)')
    await c.query('delete from ketzal.payment_schedule where booking_id in (select id from _bk)')
    await c.query('delete from ketzal.commission_lines where booking_id in (select id from _bk)')
    await c.query('delete from ketzal.credits where supplier_id = $1', [supplierId]).catch(() => {})
    await c.query('delete from ketzal.clawbot_reminders where supplier_id = $1', [supplierId])
    await c.query('delete from ketzal.bookings where id in (select id from _bk)')
    await c.query('delete from ketzal.customers where supplier_id = $1', [supplierId])
    await c.query('delete from ketzal.service_departures where service_id in (select id from ketzal.services where supplier_id = $1)', [supplierId])
    await c.query('delete from ketzal.services where supplier_id = $1', [supplierId])
    await c.query('delete from ketzal.suppliers where id = $1', [supplierId])
    for (const t of TABLAS_APPEND_ONLY) {
      await c.query(`alter table ketzal.${t} enable trigger user`)
    }
    await c.query('commit')

    // Verificar, no suponer.
    const { rows } = await c.query(
      `select (select count(*) from ketzal.suppliers where id = $1)
            + (select count(*) from ketzal.bookings
                where selling_supplier_id = $1 or owner_supplier_id = $1) as quedan`, [supplierId])
    const quedan = Number(rows[0].quedan)
    if (quedan) {
      console.error(`   ✘ QUEDARON ${quedan} filas del escenario ${supplierId}`)
      return false
    }
    console.log('   ✔ escenario borrado y verificado')
    return true
  } catch (e) {
    await c.query('rollback').catch(() => {})
    console.error(`   ✘ no se pudo borrar el escenario: ${e.message}`)
    return false
  } finally {
    await c.end()
  }
}

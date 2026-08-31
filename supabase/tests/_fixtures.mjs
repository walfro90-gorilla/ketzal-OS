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
  for (const u of restos) await borrarUsuario(u.id)
  if (restos.length) console.log(`   ⚠ barridos ${restos.length} restos de una corrida anterior`)
  return restos.length
}

/**
 * Crea una cuenta de Auth + su `profiles` por cada posición y devuelve sus JWT.
 * `posiciones`: [{ llave, role, type, supplier_id, name }]
 * Devuelve `{ [llave]: { token, id, email }, destruir() }`.
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
      const { access_token } = await rl.json()
      if (!access_token) throw new Error(`login ${email}: ${rl.status}`)

      salida[p.llave] = { token: access_token, id, email }
    }
    console.log(`   ✔ ${posiciones.length} posiciones efímeras creadas`)
    return salida
  } catch (e) {
    // Si la creación falla a medias, no dejar cuentas colgadas en producción.
    await salida.destruir()
    throw e
  }
}

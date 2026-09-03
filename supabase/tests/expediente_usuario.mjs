// El expediente de /usuarios abre — también al hacerle clic desde la lista.
//
// Por qué existe: el fundador reportó que abrir el detallado de un usuario
// fallaba con "no se encuentra". Un GET normal a la misma URL devolvía 200, así
// que parecía un fantasma. No lo era: `fmtFecha` vivía dentro de
// `usuarios-list.tsx` (`'use client'`) y el expediente —Server Component— la
// importaba y la LLAMABA. Al navegar con un clic, Next resuelve la página por
// el camino RSC y revienta:
//
//   Attempted to call fmtFecha() from the server but fmtFecha is on the client.
//
// De ahí las dos mitades de este harness: **status Y contenido**, y las dos
// formas de pedir la página. Un 200 no dice nada — la pantalla de error de Next
// también responde 200 en el camino RSC. Se exige que el HTML traiga lo que el
// expediente pinta de verdad.
//
//   pnpm build && pnpm start -p 3100
//   APP=http://localhost:3100 node --env-file=.env.local supabase/tests/expediente_usuario.mjs

import { crearPosiciones } from './_fixtures.mjs'

const U = process.env.NEXT_PUBLIC_SUPABASE_URL
const APP = process.env.APP ?? 'http://localhost:3000'
const ref = new URL(U).hostname.split('.')[0]

let ok = 0, fallos = 0
const check = (n, c, d = '') => {
  if (c) { ok++; console.log(`   ✔ ${n}`) }
  else { fallos++; console.error(`   ✘ ${n}${d ? ` — ${d}` : ''}`) }
}

/** La cookie que arma @supabase/ssr, partida en trozos como lo hace el navegador. */
function cookieDeSesion(sesion) {
  const raw = 'base64-' + Buffer.from(JSON.stringify(sesion)).toString('base64')
  const trozos = raw.match(/.{1,3180}/g) ?? [raw]
  return (trozos.length === 1
    ? [`sb-${ref}-auth-token=${trozos[0]}`]
    : trozos.map((t, i) => `sb-${ref}-auth-token.${i}=${t}`)).join('; ')
}

// Lo que el expediente pinta cuando de verdad se renderizó. Si Next devolvió su
// pantalla de error, nada de esto aparece.
const MARCAS = ['Expediente completo', 'Qué ha hecho', 'Cuenta de acceso']

console.log('\n▸ Expediente de usuario (/usuarios y su detalle)\n')

const qa = await crearPosiciones([{ llave: 'god', role: 'superadmin', type: 'agente' }])
try {
  const cookie = cookieDeSesion(qa.god.sesion)

  const lista = await fetch(`${APP}/usuarios`, { headers: { cookie }, redirect: 'manual' })
  const htmlLista = lista.status === 200 ? await lista.text() : ''
  check('/usuarios abre', lista.status === 200, String(lista.status))
  check('la lista trae su tira de resumen',
    /Pendientes de aprobación/.test(htmlLista) && /Sin cuenta de acceso/.test(htmlLista))

  const ids = [...new Set(
    [...htmlLista.matchAll(/\/usuarios\/([0-9a-f-]{36})/g)].map((m) => m[1])
  )]
  check('la lista enlaza expedientes', ids.length > 0, `${ids.length} links`)

  // b093: las fixtures viven segundos. Si salen en la lista, alguien les da clic
  // después de que se borraron y el expediente dice "no existe" — que fue justo
  // lo que se reportó. Se mira SOLO la lista de enlaces: el correo de la sesión
  // sale en el menú de cuenta del shell y buscarlo en todo el HTML da un rojo
  // falso.
  check('la cuenta efímera NO sale en la lista (b093)', !ids.includes(qa.god.id))

  // Las dos formas de llegar: escribiendo la URL y haciendo clic desde la lista.
  for (const [modo, extra] of [['URL directa', {}], ['clic desde la lista (RSC)', { RSC: '1' }]]) {
    let rotos = []
    for (const id of ids) {
      const r = await fetch(`${APP}/usuarios/${id}`, {
        headers: { cookie, ...extra }, redirect: 'manual',
      })
      const cuerpo = await r.text()
      // En el camino RSC el payload trae el texto de los componentes, así que
      // las marcas sirven igual para los dos modos.
      const sano = r.status === 200 && MARCAS.every((m) => cuerpo.includes(m))
      if (!sano) rotos.push(`${id.slice(0, 8)}:${r.status}`)
    }
    check(`todos los expedientes abren por ${modo}`, rotos.length === 0,
      `${rotos.length} rotos de ${ids.length}: ${rotos.join(' ')}`)
  }

  // Un id que no existe (o que no es de tu alcance) explica, no se cae.
  const fantasma = await fetch(`${APP}/usuarios/00000000-0000-0000-0000-000000000000`, {
    headers: { cookie }, redirect: 'manual',
  })
  const hf = fantasma.status === 200 ? await fantasma.text() : ''
  check('un id inexistente explica en vez de dar 404 mudo',
    fantasma.status === 200 && hf.includes('Cuenta no encontrada'), String(fantasma.status))
} catch (e) {
  fallos++
  console.error(`   ✘ el harness reventó: ${String(e.message ?? e).split('\n')[0]}`)
} finally {
  await qa.destruir()
}

console.log(`\n   ${ok} pasaron, ${fallos} fallaron\n`)
process.exit(fallos ? 1 : 0)

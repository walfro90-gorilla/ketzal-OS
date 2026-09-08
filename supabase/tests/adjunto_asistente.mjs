// HARD TESTING — los adjuntos del asistente entran como texto (ADR-0059).
//
//   APP=http://localhost:3100 pnpm hard-test adjunto_asistente
//
// Qué defiende: `/api/agente/adjunto` convierte un PDF, un .txt y un .docx en
// texto y lo devuelve; una imagen va al modelo de visión (aquí NO se ejercita:
// depende de GROQ_API_KEY y de un tercero, y su contrato está en
// `adjuntos.test.ts` con el transcriptor sustituido). Solo el superadmin puede
// subir (un admin de agencia recibe 403), lo que pesa más de 4 MB recibe 413 y
// un tipo desconocido 415. El PDF se construye aquí mismo, byte a byte, para no
// depender de un archivo suelto.
//
// Cuentas efímeras por `crearPosiciones` (ADR-0023); nada queda en la BD.

import { deflateRawSync } from 'node:zlib'
import { crearPosiciones } from './_fixtures.mjs'

const U = process.env.NEXT_PUBLIC_SUPABASE_URL
const APP = process.env.APP ?? 'http://localhost:3000'
const ref = new URL(U).hostname.split('.')[0]

let ok = 0, fallos = 0
const check = (n, c, d = '') => {
  if (c) { ok++; console.log(`   ✔ ${n}`) }
  else { fallos++; console.error(`   ✘ ${n}${d ? ` — ${d}` : ''}`) }
}

function cookieDeSesion(sesion) {
  const raw = 'base64-' + Buffer.from(JSON.stringify(sesion)).toString('base64')
  const trozos = raw.match(/.{1,3180}/g) ?? [raw]
  return (trozos.length === 1
    ? [`sb-${ref}-auth-token=${trozos[0]}`]
    : trozos.map((t, i) => `sb-${ref}-auth-token.${i}=${t}`)).join('; ')
}

/** Un PDF de una página con Helvetica (fuente estándar, sin incrustar) y un texto. */
function pdfMinimo(texto) {
  const stream = `BT /F1 14 Tf 72 720 Td (${texto}) Tj ET`
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let out = '%PDF-1.4\n'
  const offs = []
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n` })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
  for (const o of offs) out += `${String(o).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}

/** Un .docx mínimo: zip con word/document.xml (deflate). */
function docxMinimo(texto) {
  const enc = new TextEncoder()
  const tabla = new Uint32Array(256)
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; tabla[n] = c >>> 0 }
  const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = tabla[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const u16 = (n) => [n & 0xff, (n >>> 8) & 0xff]
  const u32 = (n) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]
  const nombre = enc.encode('word/document.xml')
  const datos = enc.encode(`<w:document><w:body><w:p><w:r><w:t>${texto}</w:t></w:r></w:p></w:body></w:document>`)
  const comp = new Uint8Array(deflateRawSync(datos))
  const local = [...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(8), ...u16(0), ...u16(0), ...u32(crc32(datos)),
    ...u32(comp.length), ...u32(datos.length), ...u16(nombre.length), ...u16(0), ...nombre, ...comp]
  const central = [...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(8), ...u16(0), ...u16(0), ...u32(crc32(datos)),
    ...u32(comp.length), ...u32(datos.length), ...u16(nombre.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(0), ...nombre]
  const eocd = [...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(1), ...u16(1), ...u32(central.length), ...u32(local.length), ...u16(0)]
  return Buffer.from([...local, ...central, ...eocd])
}

try { await fetch(`${APP}/login`) } catch {
  console.error(`\n✘ No hay nada escuchando en ${APP}. Levanta la app (pnpm start -p 3100).\n`)
  process.exit(1)
}

console.log('\n▸ Adjuntos del asistente: PDF, texto y Word entran como texto; solo el superadmin\n')

const qa = await crearPosiciones([
  { llave: 'jefe', role: 'superadmin', type: 'agente', name: 'QA Jefe' },
  { llave: 'admin', role: 'admin', type: 'agente', name: 'QA Admin Agencia' },
])

async function subir(cookie, nombre, tipo, bytes) {
  const fd = new FormData()
  fd.append('archivo', new File([bytes], nombre, { type: tipo }))
  const r = await fetch(`${APP}/api/agente/adjunto`, { method: 'POST', headers: { cookie }, body: fd })
  return { status: r.status, cuerpo: await r.json().catch(() => null) }
}

try {
  const jefe = cookieDeSesion(qa.jefe.sesion)
  const admin = cookieDeSesion(qa.admin.sesion)

  const txt = await subir(jefe, 'notas.txt', 'text/plain', Buffer.from('Tarifa QA ADJUNTO 4242\r\nSegunda línea'))
  check('un .txt vuelve como texto, con saltos normalizados', txt.status === 200 && txt.cuerpo?.texto === 'Tarifa QA ADJUNTO 4242\nSegunda línea',
    `HTTP ${txt.status} ${JSON.stringify(txt.cuerpo)?.slice(0, 160)}`)

  const pdf = await subir(jefe, 'cotizacion.pdf', 'application/pdf',
    pdfMinimo('KETZAL QA PDF 4242 Cotizacion Creel y Barrancas 2 noches 1200 MXN por persona'))
  check('un PDF con capa de texto vuelve con su texto', pdf.status === 200 && /KETZAL QA PDF 4242/.test(pdf.cuerpo?.texto ?? ''),
    `HTTP ${pdf.status} ${JSON.stringify(pdf.cuerpo)?.slice(0, 160)}`)

  const docx = await subir(jefe, 'itinerario.docx', 'application/octet-stream', docxMinimo('Itinerario QA DOCX 4242'))
  check('un .docx (aunque llegue como octet-stream) vuelve con su texto', docx.status === 200 && docx.cuerpo?.texto === 'Itinerario QA DOCX 4242',
    `HTTP ${docx.status} ${JSON.stringify(docx.cuerpo)?.slice(0, 160)}`)

  const csv = await subir(jefe, 'tarifas.csv', 'application/vnd.ms-excel', Buffer.from('proveedor,costo\nSprinter,8000'))
  check('un .csv que Windows etiqueta como Excel se acepta por extensión', csv.status === 200 && /Sprinter,8000/.test(csv.cuerpo?.texto ?? ''),
    `HTTP ${csv.status}`)

  const exe = await subir(jefe, 'algo.exe', 'application/octet-stream', Buffer.from('MZ'))
  check('un tipo desconocido recibe 415', exe.status === 415, `HTTP ${exe.status}`)

  const gordo = await subir(jefe, 'gordo.txt', 'text/plain', Buffer.alloc(4 * 1024 * 1024 + 1, 97))
  check('más de 4 MB recibe 413', gordo.status === 413, `HTTP ${gordo.status}`)

  const vacio = await subir(jefe, 'vacio.txt', 'text/plain', Buffer.alloc(0))
  check('un archivo vacío recibe 400', vacio.status === 400, `HTTP ${vacio.status}`)

  const ajeno = await subir(admin, 'notas.txt', 'text/plain', Buffer.from('hola'))
  check('un admin de agencia recibe 403 (mismo gate que /api/agente)', ajeno.status === 403, `HTTP ${ajeno.status}`)

  const anon = await fetch(`${APP}/api/agente/adjunto`, { method: 'POST', body: new FormData() })
  check('sin sesión recibe 401', anon.status === 401, `HTTP ${anon.status}`)
} finally {
  const limpio = await qa.destruir()
  if (!limpio) fallos++
}

console.log(`\n${fallos ? '✘' : '✔'} ${ok} pasaron, ${fallos} fallaron\n`)
process.exit(fallos ? 1 : 0)

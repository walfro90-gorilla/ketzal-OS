import { deflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { entradaZip, extraerTexto, textoDeDocx } from './adjuntos'

// ── Un escritor de ZIP mínimo, solo para el test ─────────────────────────────
const TABLA = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(b: Uint8Array): number {
  let c = 0xffffffff
  for (const x of b) c = TABLA[(c ^ x) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function u16(n: number) {
  return [n & 0xff, (n >>> 8) & 0xff]
}
function u32(n: number) {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]
}
function zip(entradas: { nombre: string; datos: Uint8Array; deflate?: boolean }[]): Uint8Array {
  const enc = new TextEncoder()
  const partes: number[] = []
  const central: number[] = []
  for (const e of entradas) {
    const nombre = enc.encode(e.nombre)
    const comp = e.deflate ? new Uint8Array(deflateRawSync(e.datos)) : e.datos
    const metodo = e.deflate ? 8 : 0
    const off = partes.length
    partes.push(
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(metodo), ...u16(0), ...u16(0),
      ...u32(crc32(e.datos)), ...u32(comp.length), ...u32(e.datos.length), ...u16(nombre.length), ...u16(0),
      ...nombre, ...comp,
    )
    central.push(
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(metodo), ...u16(0), ...u16(0),
      ...u32(crc32(e.datos)), ...u32(comp.length), ...u32(e.datos.length), ...u16(nombre.length), ...u16(0),
      ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off), ...nombre,
    )
  }
  const offCentral = partes.length
  const out = [
    ...partes, ...central,
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entradas.length), ...u16(entradas.length),
    ...u32(central.length), ...u32(offCentral), ...u16(0),
  ]
  return new Uint8Array(out)
}

const XML =
  '<?xml version="1.0"?><w:document><w:body><w:p><w:r><w:t>Tarifa Creel</w:t></w:r></w:p>' +
  '<w:p><w:r><w:t>Sprinter</w:t><w:tab/><w:t>8,000</w:t></w:r></w:p></w:body></w:document>'
const enc = new TextEncoder()

describe('entradaZip', () => {
  it('encuentra la entrada guardada sin compresión', () => {
    const z = zip([{ nombre: 'otro.txt', datos: enc.encode('x') }, { nombre: 'word/document.xml', datos: enc.encode(XML) }])
    expect(new TextDecoder().decode(entradaZip(z, 'word/document.xml')!)).toBe(XML)
  })
  it('descomprime deflate (lo que usa Word)', () => {
    const z = zip([{ nombre: 'word/document.xml', datos: enc.encode(XML), deflate: true }])
    expect(new TextDecoder().decode(entradaZip(z, 'word/document.xml')!)).toBe(XML)
  })
  it('null si no está la entrada o no es un zip', () => {
    expect(entradaZip(zip([{ nombre: 'a', datos: enc.encode('a') }]), 'b')).toBeNull()
    expect(entradaZip(new Uint8Array([1, 2, 3]), 'a')).toBeNull()
    expect(entradaZip(enc.encode('esto no es un zip pero es más largo que veintidós bytes'), 'a')).toBeNull()
  })
})

describe('textoDeDocx y extraerTexto', () => {
  const docx = zip([
    { nombre: '[Content_Types].xml', datos: enc.encode('<Types/>'), deflate: true },
    { nombre: 'word/document.xml', datos: enc.encode(XML), deflate: true },
  ])
  it('saca el texto del documento', () => {
    expect(textoDeDocx(docx)).toBe('Tarifa Creel\nSprinter\t8,000')
  })
  it('un .docx entra por extraerTexto aunque el navegador mande octet-stream', async () => {
    const r = await extraerTexto({ name: 'tarifas.docx', type: 'application/octet-stream', bytes: docx })
    expect(r).toEqual({ texto: 'Tarifa Creel\nSprinter\t8,000', recortado: false })
  })
  it('un zip que no es docx da error legible, no excepción', async () => {
    const r = await extraerTexto({ name: 'x.docx', type: '', bytes: zip([{ nombre: 'a', datos: enc.encode('a') }]) })
    expect(r).toHaveProperty('error')
  })
  it('texto plano tal cual; vacío es error; largo se recorta', async () => {
    expect(await extraerTexto({ name: 'n.txt', type: 'text/plain', bytes: enc.encode(' hola\r\nmundo ') })).toEqual({
      texto: 'hola\nmundo',
      recortado: false,
    })
    expect(await extraerTexto({ name: 'n.txt', type: 'text/plain', bytes: enc.encode('   ') })).toHaveProperty('error')
    const largo = await extraerTexto({ name: 'n.csv', type: 'text/csv', bytes: enc.encode('a,b\n'.repeat(20_000)) })
    expect(largo).toMatchObject({ recortado: true })
  })
  it('una imagen pasa por el transcriptor con su data URI; su error se propaga', async () => {
    const visto: string[] = []
    const ok = await extraerTexto(
      { name: 'volante.png', type: 'image/png', bytes: new Uint8Array([137, 80, 78, 71]) },
      async (uri) => {
        visto.push(uri)
        return { texto: 'CREEL $1,200' }
      }
    )
    expect(ok).toEqual({ texto: 'CREEL $1,200', recortado: false })
    expect(visto[0]).toBe('data:image/png;base64,iVBORw==')
    const mal = await extraerTexto({ name: 'v.jpg', type: 'image/jpeg', bytes: new Uint8Array([1]) }, async () => ({
      error: 'sin lector',
    }))
    expect(mal).toEqual({ error: 'sin lector' })
  })
  it('un tipo desconocido se rechaza antes de leer nada', async () => {
    expect(await extraerTexto({ name: 'x.exe', type: 'application/octet-stream', bytes: new Uint8Array(1) })).toHaveProperty(
      'error'
    )
  })
})

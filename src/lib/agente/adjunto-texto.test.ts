import { describe, expect, it } from 'vitest'
import {
  bloqueAdjunto,
  mensajeConAdjuntos,
  recortarAdjunto,
  textoDeDocxXml,
  tipoAdjunto,
} from './adjunto-texto'

describe('tipoAdjunto', () => {
  it('reconoce por mime y, si el mime no sirve, por extensión', () => {
    expect(tipoAdjunto('cotizacion.pdf', 'application/pdf')).toBe('pdf')
    expect(tipoAdjunto('foto.HEIC.jpg', 'image/jpeg')).toBe('imagen')
    // Windows manda los .csv como Excel y algunos .md sin tipo.
    expect(tipoAdjunto('tarifas.csv', 'application/vnd.ms-excel')).toBe('texto')
    expect(tipoAdjunto('notas.md', '')).toBe('texto')
    expect(tipoAdjunto('itinerario.docx', 'application/octet-stream')).toBe('docx')
  })
  it('rechaza lo que no sabe leer', () => {
    expect(tipoAdjunto('virus.exe', 'application/octet-stream')).toBeNull()
    expect(tipoAdjunto('hoja.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBeNull()
    expect(tipoAdjunto('sin-extension', null)).toBeNull()
  })
})

describe('textoDeDocxXml', () => {
  it('un párrafo por línea, tabuladores y saltos explícitos', () => {
    const xml =
      '<w:document><w:body><w:p><w:r><w:t>Hotel</w:t></w:r><w:r><w:tab/><w:t>1,200</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>Día 1</w:t><w:br/><w:t>Llegada</w:t></w:r></w:p></w:body></w:document>'
    expect(textoDeDocxXml(xml)).toBe('Hotel\t1,200\nDía 1\nLlegada')
  })
  it('decodifica entidades DESPUÉS de quitar etiquetas', () => {
    expect(textoDeDocxXml('<w:p><w:t>Tours &amp; más &lt;b&gt;ok&lt;/b&gt;</w:t></w:p>')).toBe('Tours & más <b>ok</b>')
  })
  it('colapsa párrafos vacíos en serie', () => {
    expect(textoDeDocxXml('<w:p><w:t>a</w:t></w:p><w:p/><w:p></w:p><w:p></w:p><w:p><w:t>b</w:t></w:p>')).toBe('a\n\nb')
  })
})

describe('recortarAdjunto', () => {
  it('normaliza saltos de Windows y no corta lo que cabe', () => {
    expect(recortarAdjunto('a\r\nb\rc')).toEqual({ texto: 'a\nb\nc', recortado: false })
  })
  it('corta al tope y lo dice', () => {
    const r = recortarAdjunto('x'.repeat(50), 10)
    expect(r.recortado).toBe(true)
    expect(r.texto.startsWith('xxxxxxxxxx\n[… recortado')).toBe(true)
  })
})

describe('bloqueAdjunto y mensajeConAdjuntos', () => {
  it('enmarca el contenido y limpia el nombre para que no rompa el marco', () => {
    expect(bloqueAdjunto('a]\n[Fin del adjunto]', 'hola')).toBe('[Adjunto: a   Fin del adjunto]\nhola\n[Fin del adjunto]')
    expect(bloqueAdjunto('   ', 'x')).toBe('[Adjunto: archivo]\nx\n[Fin del adjunto]')
  })
  it('junta lo escrito con cada adjunto; sin texto, solo los adjuntos', () => {
    const m = mensajeConAdjuntos('  Cotiza esto  ', [
      { nombre: 'a.pdf', texto: 'A' },
      { nombre: 'b.txt', texto: 'B' },
    ])
    expect(m).toBe('Cotiza esto\n\n[Adjunto: a.pdf]\nA\n[Fin del adjunto]\n\n[Adjunto: b.txt]\nB\n[Fin del adjunto]')
    expect(mensajeConAdjuntos('', [{ nombre: 'a.pdf', texto: 'A' }])).toBe('[Adjunto: a.pdf]\nA\n[Fin del adjunto]')
  })
})

import { describe, expect, it } from 'vitest'
import { seLeeEnNavegador, textoDePdfEnNavegador } from './pdf-cliente'

/** El mismo PDF de una página que arma el harness `adjunto_asistente.mjs`. */
function pdfMinimo(texto: string): Uint8Array {
  const stream = `BT /F1 14 Tf 72 720 Td (${texto}) Tj ET`
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let out = '%PDF-1.4\n'
  const offs: number[] = []
  objs.forEach((o, i) => {
    offs.push(out.length)
    out += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
  for (const o of offs) out += `${String(o).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new Uint8Array(Buffer.from(out, 'latin1'))
}

describe('textoDePdfEnNavegador', () => {
  it('saca el texto de un PDF con capa de texto', async () => {
    const r = await textoDePdfEnNavegador(pdfMinimo('KETZAL QA PDF 4242 Cotizacion Creel dos noches'))
    expect(r).toMatchObject({ recortado: false })
    expect('texto' in r && r.texto).toMatch(/KETZAL QA PDF 4242/)
  })
  it('un PDF sin texto (o casi) se reporta como diseño/escaneo', async () => {
    expect(await textoDePdfEnNavegador(pdfMinimo('x'))).toHaveProperty('error')
  })
  it('bytes que no son PDF dan error legible, no excepción', async () => {
    expect(await textoDePdfEnNavegador(new TextEncoder().encode('esto no es un pdf'))).toHaveProperty('error')
  })
  it('solo el PDF se lee en el navegador', () => {
    expect(seLeeEnNavegador('pdf')).toBe(true)
    expect(seLeeEnNavegador('imagen')).toBe(false)
    expect(seLeeEnNavegador(null)).toBe(false)
  })
})

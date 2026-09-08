/**
 * Un PDF se lee EN EL NAVEGADOR (ADR-0060): Vercel corta el body de una función
 * en 4.5 MB (medido: 413 "Request Entity Too Large" con 6, 12 y 30 MB) y un PDF
 * de diseño (Canva, folleto con fotos) pesa más que eso aunque su texto sean
 * dos párrafos. `unpdf` corre igual en el navegador que en el servidor, con el
 * worker de pdf.js incrustado; se importa dinámico para que el shell del OS no
 * cargue 1.6 MB hasta que alguien adjunte un PDF.
 *
 * Aquí solo cambia DÓNDE se extrae: el texto entra al mensaje igual que
 * cualquier adjunto (ADR-0059).
 */

import { MIN_TEXTO_PDF, recortarAdjunto, type TipoAdjunto } from './adjunto-texto'

/** Lo que aguanta cómodo la memoria de un navegador de celular. */
export const MAX_BYTES_PDF_NAVEGADOR = 40 * 1024 * 1024

export const MENSAJE_PESO_PDF = 'El PDF pesa más de 40 MB. Exporta una versión más ligera o solo las páginas que importan.'

export const MENSAJE_PDF_SIN_TEXTO =
  'Ese PDF no trae texto (es un diseño o un escaneo). Toma una captura de pantalla y súbela como imagen.'

/** El PDF es el único tipo que se lee en el cliente; el resto va al servidor. */
export function seLeeEnNavegador(tipo: TipoAdjunto | null): boolean {
  return tipo === 'pdf'
}

export async function textoDePdfEnNavegador(
  bytes: Uint8Array
): Promise<{ texto: string; recortado: boolean } | { error: string }> {
  let texto: string
  try {
    const { extractText, getDocumentProxy } = await import('unpdf')
    const pdf = await getDocumentProxy(bytes)
    texto = (await extractText(pdf, { mergePages: true })).text.trim()
  } catch (e) {
    console.error('[adjunto] pdf navegador', e)
    return { error: 'No se pudo leer el PDF. ¿Está dañado o protegido?' }
  }
  if (texto.length < MIN_TEXTO_PDF) return { error: MENSAJE_PDF_SIN_TEXTO }
  return recortarAdjunto(texto)
}

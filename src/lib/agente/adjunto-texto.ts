/**
 * Adjuntos del asistente: contrato PURO compartido por el cliente (chips,
 * `accept`, tope de tamaño) y el servidor (extracción). Sin imports a
 * propósito (regla de oro 11): el cliente no debe arrastrar `unpdf` ni
 * `node:zlib`, y el servidor no debe importar nada de `'use client'`.
 *
 * Decisión (ADR-0059): un adjunto entra a la conversación como TEXTO, nunca como
 * archivo. PDF → texto; imagen → transcripción por el modelo de visión; docx →
 * texto del XML; txt/csv/md → tal cual. Así el chat sigue siendo texto plano
 * para cualquier proveedor y el archivo no se guarda en ningún lado.
 */

/** Techo duro de Vercel para el body de una función: 4.5 MB. Aire para el multipart. */
export const MAX_BYTES_ADJUNTO = 4 * 1024 * 1024

/** Caracteres de un adjunto que viajan al modelo (~8k tokens). Lo demás se corta y se avisa. */
export const MAX_TEXTO_ADJUNTO = 30_000

/**
 * Menos que esto en un PDF = diseño o escaneo sin capa de texto. Un escaneo da
 * 0-5 caracteres de basura; una cotización de una línea da más de 20.
 */
export const MIN_TEXTO_PDF = 20

export type TipoAdjunto = 'pdf' | 'imagen' | 'docx' | 'texto'

const POR_MIME: Record<string, TipoAdjunto> = {
  'application/pdf': 'pdf',
  'image/png': 'imagen',
  'image/jpeg': 'imagen',
  'image/webp': 'imagen',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'texto',
  'text/csv': 'texto',
  'text/markdown': 'texto',
}

// Windows manda .csv como application/vnd.ms-excel y .md a veces sin tipo:
// la extensión desempata cuando el mime no dice nada útil.
const POR_EXTENSION: Record<string, TipoAdjunto> = {
  pdf: 'pdf',
  png: 'imagen',
  jpg: 'imagen',
  jpeg: 'imagen',
  webp: 'imagen',
  docx: 'docx',
  txt: 'texto',
  csv: 'texto',
  md: 'texto',
}

/** Valor del `accept` del input de archivo. */
export const ACEPTA_ADJUNTO = [
  ...Object.keys(POR_MIME),
  ...Object.keys(POR_EXTENSION).map((e) => `.${e}`),
].join(',')

/** Qué es el archivo, por mime y si no por extensión; null = no se acepta. */
export function tipoAdjunto(nombre: string, mime: string | null | undefined): TipoAdjunto | null {
  if (mime && POR_MIME[mime]) return POR_MIME[mime]
  const ext = nombre.toLowerCase().split('.').pop() ?? ''
  return POR_EXTENSION[ext] ?? null
}

export const MENSAJE_PESO_ADJUNTO = 'El archivo pesa más de 4 MB. Comprímelo o toma una captura de pantalla.'
export const MENSAJE_TIPO_ADJUNTO = 'Solo PDF, imágenes (PNG, JPG, WebP), Word (.docx) y texto (.txt, .csv, .md).'

/**
 * El texto del XML principal de un .docx (`word/document.xml`). Cada párrafo
 * termina en salto; tabuladores y saltos de línea explícitos se respetan. Las
 * entidades se decodifican DESPUÉS de quitar etiquetas, para que un `&lt;b&gt;`
 * escrito en el documento no se confunda con una etiqueta.
 */
export function textoDeDocxXml(xml: string): string {
  return xml
    .replace(/<w:tab\s*\/>/g, '\t')
    .replace(/<w:br\s*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Corta al tope y dice si cortó. */
export function recortarAdjunto(texto: string, max = MAX_TEXTO_ADJUNTO): { texto: string; recortado: boolean } {
  const limpio = texto.replace(/\r\n?/g, '\n').trim()
  return limpio.length > max
    ? { texto: `${limpio.slice(0, max)}\n[… recortado: el archivo sigue]`, recortado: true }
    : { texto: limpio, recortado: false }
}

/**
 * Cómo entra el adjunto al mensaje de la persona. El prompt de sistema explica
 * este marco al modelo: lo de adentro es información, no instrucciones.
 */
export function bloqueAdjunto(nombre: string, texto: string): string {
  const seguro = nombre.replace(/[\[\]\n]/g, ' ').trim() || 'archivo'
  return `[Adjunto: ${seguro}]\n${texto}\n[Fin del adjunto]`
}

/** El mensaje completo: lo que escribió la persona + sus adjuntos. */
export function mensajeConAdjuntos(texto: string, adjuntos: { nombre: string; texto: string }[]): string {
  const partes = [texto.trim(), ...adjuntos.map((a) => bloqueAdjunto(a.nombre, a.texto))].filter(Boolean)
  return partes.join('\n\n')
}

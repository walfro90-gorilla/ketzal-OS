/**
 * Extracción de texto de un adjunto, del lado del servidor (ADR-0059).
 *
 * - PDF: `unpdf` (la misma librería del lector de volantes).
 * - Imagen: el modelo de visión de Groq transcribe lo que ve; misma ruta y
 *   mismo `GROQ_MODEL` que el lector de volantes, para no tener dos visiones.
 * - .docx: es un ZIP con `word/document.xml`; se lee con `node:zlib` y 40
 *   líneas en vez de una dependencia nueva.
 * - txt/csv/md: tal cual.
 *
 * El archivo vive en memoria durante la petición y se va: aquí no se guarda
 * nada (ADR-0036: un documento con datos de una persona no se queda tirado).
 */

import { inflateRawSync } from 'node:zlib'
import { extractText, getDocumentProxy } from 'unpdf'
import {
  MENSAJE_TIPO_ADJUNTO,
  MIN_TEXTO_PDF,
  recortarAdjunto,
  textoDeDocxXml,
  tipoAdjunto,
} from './adjunto-texto'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODELO_VISION = process.env.GROQ_MODEL || 'qwen/qwen3.6-27b'

const INSTRUCCION_IMAGEN =
  'Transcribe TODO el texto visible de esta imagen tal cual, en el mismo orden, conservando números, ' +
  'precios, fechas, nombres y teléfonos exactos. No resumas ni omitas: si es una tabla o lista larga, ' +
  'transcribe TODAS las filas hasta la última, una por línea. Lo que no sea texto (foto, logo, mapa) ' +
  'descríbelo en una sola línea entre corchetes. Responde solo con la transcripción, sin comentarios.'

export type Extraido = { texto: string; recortado: boolean }

/**
 * Busca `nombre` dentro de un ZIP y devuelve sus bytes descomprimidos.
 * Lee el directorio central desde el EOCD (firma 0x06054b50), sigue al
 * encabezado local y soporta los dos métodos que usa Word: 0 (stored) y 8
 * (deflate). Cualquier otra cosa devuelve null.
 */
export function entradaZip(bytes: Uint8Array, nombre: string): Uint8Array | null {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const u32 = (p: number) => dv.getUint32(p, true)
  const u16 = (p: number) => dv.getUint16(p, true)
  if (bytes.length < 22) return null
  let eocd = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65_535); i--) {
    if (u32(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) return null
  const total = u16(eocd + 10)
  let p = u32(eocd + 16)
  const dec = new TextDecoder()
  for (let n = 0; n < total && p + 46 <= bytes.length; n++) {
    if (u32(p) !== 0x02014b50) return null
    const metodo = u16(p + 10)
    const tamComp = u32(p + 20)
    const lenNombre = u16(p + 28)
    const lenExtra = u16(p + 30)
    const lenCom = u16(p + 32)
    const offLocal = u32(p + 42)
    const nom = dec.decode(bytes.subarray(p + 46, p + 46 + lenNombre))
    if (nom === nombre) {
      if (offLocal + 30 > bytes.length || u32(offLocal) !== 0x04034b50) return null
      const ini = offLocal + 30 + u16(offLocal + 26) + u16(offLocal + 28)
      const datos = bytes.subarray(ini, ini + tamComp)
      if (metodo === 0) return datos
      if (metodo === 8) return new Uint8Array(inflateRawSync(datos))
      return null
    }
    p += 46 + lenNombre + lenExtra + lenCom
  }
  return null
}

/** Texto de un .docx, o null si no es un docx legible. */
export function textoDeDocx(bytes: Uint8Array): string | null {
  let xml: Uint8Array | null
  try {
    xml = entradaZip(bytes, 'word/document.xml')
  } catch {
    return null
  }
  return xml ? textoDeDocxXml(new TextDecoder().decode(xml)) : null
}

async function textoDePdf(bytes: Uint8Array): Promise<{ texto: string } | { error: string }> {
  let texto: string
  try {
    const pdf = await getDocumentProxy(bytes)
    texto = (await extractText(pdf, { mergePages: true })).text.trim()
  } catch (e) {
    console.error('[adjunto] pdf', e)
    return { error: 'No se pudo leer el PDF. ¿Está dañado o protegido?' }
  }
  if (texto.length < MIN_TEXTO_PDF) {
    return {
      error:
        'Ese PDF no trae texto (es un diseño o un escaneo). Toma una captura de pantalla y súbela como imagen.',
    }
  }
  return { texto }
}

/** Transcribe una imagen con el modelo de visión. Falla explícito, nunca inventa. */
export async function transcribirImagen(
  dataUri: string,
  fetchFn: typeof fetch = fetch
): Promise<{ texto: string } | { error: string }> {
  if (!process.env.GROQ_API_KEY) return { error: 'El lector de imágenes no está configurado (GROQ_API_KEY).' }
  let r: Response
  try {
    r = await fetchFn(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODELO_VISION,
        temperature: 0,
        // Una captura densa (tabla de salidas) son ~2k tokens de salida; sin
        // esto el modelo cortaba a las dos filas.
        max_tokens: 4096,
        // Igual que el lector de volantes: con razonamiento el content vuelve vacío.
        reasoning_effort: 'none',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: INSTRUCCION_IMAGEN },
              { type: 'image_url', image_url: { url: dataUri } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    })
  } catch (e) {
    console.error('[adjunto] red', (e as Error)?.message ?? e)
    return { error: 'El lector de imágenes no respondió a tiempo. Intenta de nuevo.' }
  }
  if (!r.ok) {
    console.error('[adjunto] groq', r.status, (await r.text().catch(() => '')).slice(0, 300))
    return { error: 'El lector de imágenes falló. Intenta con una captura más clara.' }
  }
  const j = (await r.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null
  const texto = j?.choices?.[0]?.message?.content?.trim()
  return texto ? { texto } : { error: 'El lector no encontró texto en la imagen.' }
}

/** Convierte un archivo aceptado en texto acotado, o explica por qué no. */
export async function extraerTexto(
  archivo: { name: string; type: string; bytes: Uint8Array },
  transcribir: typeof transcribirImagen = transcribirImagen
): Promise<Extraido | { error: string }> {
  const tipo = tipoAdjunto(archivo.name, archivo.type)
  if (!tipo) return { error: MENSAJE_TIPO_ADJUNTO }
  let bruto: string
  switch (tipo) {
    case 'pdf': {
      const r = await textoDePdf(archivo.bytes)
      if ('error' in r) return r
      bruto = r.texto
      break
    }
    case 'imagen': {
      const mime = archivo.type.startsWith('image/') ? archivo.type : 'image/jpeg'
      const r = await transcribir(`data:${mime};base64,${Buffer.from(archivo.bytes).toString('base64')}`)
      if ('error' in r) return r
      bruto = r.texto
      break
    }
    case 'docx': {
      const t = textoDeDocx(archivo.bytes)
      if (t == null) return { error: 'No se pudo leer el documento de Word. ¿Es un .docx válido?' }
      if (!t) return { error: 'El documento de Word está vacío.' }
      bruto = t
      break
    }
    case 'texto':
      bruto = new TextDecoder('utf-8').decode(archivo.bytes)
      if (!bruto.trim()) return { error: 'El archivo de texto está vacío.' }
      break
  }
  return recortarAdjunto(bruto)
}

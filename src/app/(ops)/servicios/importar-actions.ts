'use server'

import { extractText, getDocumentProxy } from 'unpdf'
import { createClient } from '@/lib/supabase/server'
import {
  MAX_BYTES,
  MENSAJE_PESO,
  normalizarLeido,
  tieneDatos,
  type ServicioLeido,
} from '@/lib/ai/servicio-leido'

/**
 * Lector de volantes: PDF o imagen → campos del servicio pre-rellenados.
 *
 * NO guarda nada. Devuelve datos para que el form los pinte y el agente
 * confirme/corrija antes de dar Guardar. Groq es OpenAI-compatible, así que
 * basta `fetch` (sin SDK). Los PDF no se mandan al modelo: Groq no acepta
 * documentos, así que se extrae el texto y se manda como texto.
 */

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

// Modelo con visión en Groq. Override por env porque Groq deprecia IDs seguido
// y no vale un redeploy de código para cambiar un string.
const MODELO = process.env.GROQ_MODEL || 'qwen/qwen3.6-27b'

const TIPOS_ACEPTADOS = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
]

/** Texto de PDF que se le manda al modelo (~5k tokens). Un volante cabe de sobra. */
const MAX_TEXTO = 20_000

/** Menos que esto ⇒ el PDF es diseño/escaneo sin capa de texto. */
const MIN_TEXTO = 80

const INSTRUCCION = `Eres asistente de una agencia de viajes mexicana. Lee el material del tour/paquete y devuelve SOLO un objeto JSON con los datos que realmente aparezcan.

Claves posibles (OMITE las que no aparezcan — nunca inventes):
- "name": nombre del tour tal como se anuncia
- "description": resumen de 2 o 3 frases
- "service_type": uno de "tour", "paquete", "transporte", "hospedaje", "actividad"
- "price": precio por persona en MXN, solo el número (si hay varios, el más bajo)
- "max_capacity": cupo máximo de personas, entero
- "state_from", "city_from": estado y ciudad de SALIDA
- "state_to", "city_to": estado y ciudad del DESTINO
- "available_from", "available_to": fechas en formato YYYY-MM-DD
- "includes": arreglo de textos, un concepto incluido por elemento
- "excludes": arreglo de textos, lo que NO incluye
- "itinerary": arreglo de {"title": "...", "description": "..."}, un elemento por día
- "packs": {"sencilla": n, "doble": n, "triple": n, "cuadruple": n} — precio POR PERSONA según ocupación de la habitación

Reglas:
- Los precios van como número, sin "$", sin comas, sin "MXN".
- Si una fecha no trae año explícito, OMITE esa fecha.
- Conserva el español del material; no traduzcas ni redactes de nuevo lo que ya viene escrito.
- Responde únicamente el JSON, sin explicaciones.`

type Parte =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

/** Quita cercas ```json que algunos modelos meten aun en modo JSON. */
function parsearJson(bruto: string): unknown {
  const limpio = bruto.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '')
  try {
    return JSON.parse(limpio)
  } catch {
    return null
  }
}

export async function leerArchivoServicio(
  formData: FormData
): Promise<{ error: string } | { datos: ServicioLeido }> {
  // Puerta de autenticación antes de gastar tokens: el lector cuesta dinero.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Inicia sesión para usar el lector.' }

  if (!process.env.GROQ_API_KEY) {
    return { error: 'El lector no está configurado (falta GROQ_API_KEY).' }
  }

  const archivo = formData.get('archivo')
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { error: 'Sube un PDF o una imagen.' }
  }
  if (!TIPOS_ACEPTADOS.includes(archivo.type)) {
    return { error: 'Formato no soportado. Usa PDF, JPG, PNG o WebP.' }
  }
  // Red de seguridad: el cliente ya lo checa (allá evita el 413 de Vercel, que
  // mataría el request antes de llegar aquí), pero el action es invocable directo.
  if (archivo.size > MAX_BYTES) {
    return { error: MENSAJE_PESO }
  }

  const bytes = new Uint8Array(await archivo.arrayBuffer())

  let contenido: Parte
  if (archivo.type === 'application/pdf') {
    let texto: string
    try {
      const pdf = await getDocumentProxy(bytes)
      const extraido = await extractText(pdf, { mergePages: true })
      texto = extraido.text.trim()
    } catch (e) {
      console.error('[lector] pdf', e)
      return { error: 'No se pudo leer el PDF. ¿Está dañado o protegido?' }
    }
    if (texto.length < MIN_TEXTO) {
      return {
        error:
          'Ese PDF no trae texto (es un diseño o un escaneo). Toma una captura de pantalla y súbela como imagen.',
      }
    }
    contenido = { type: 'text', text: texto.slice(0, MAX_TEXTO) }
  } else {
    const dataUri = `data:${archivo.type};base64,${Buffer.from(bytes).toString('base64')}`
    contenido = { type: 'image_url', image_url: { url: dataUri } }
  }

  let respuesta: Response
  try {
    respuesta = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODELO,
        temperature: 0,
        // qwen3.6 es modelo de razonamiento: con el razonamiento activo gasta
        // la generación pensando y `content` vuelve VACÍO, así que el modo JSON
        // falla con json_validate_failed. Apagarlo es lo que hace que extraiga.
        // Extraer campos de un volante no necesita cadena de pensamiento.
        reasoning_effort: 'none',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: INSTRUCCION }, contenido],
          },
        ],
      }),
      signal: AbortSignal.timeout(90_000),
    })
  } catch (e) {
    console.error('[lector] red', e)
    return { error: 'El lector no respondió a tiempo. Intenta de nuevo.' }
  }

  if (!respuesta.ok) {
    // El detalle solo al log del servidor: puede traer eco del request.
    console.error('[lector] groq', respuesta.status, await respuesta.text().catch(() => ''))
    return { error: 'El lector falló. Captura los datos a mano o intenta de nuevo.' }
  }

  const cuerpo = (await respuesta.json().catch(() => null)) as
    | { choices?: { message?: { content?: string } }[] }
    | null
  const bruto = cuerpo?.choices?.[0]?.message?.content
  if (!bruto) return { error: 'El lector no devolvió nada. Intenta de nuevo.' }

  const datos = normalizarLeido(parsearJson(bruto))
  if (!tieneDatos(datos)) {
    return {
      error:
        'No reconocí datos de un tour en ese archivo. Revisa que sea el volante correcto.',
    }
  }

  return { datos }
}

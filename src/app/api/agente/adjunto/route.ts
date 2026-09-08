/**
 * Un adjunto del asistente entra como TEXTO (ADR-0059): aquí se convierte y se
 * devuelve; el cliente lo pega al mensaje de la persona. Nada se guarda.
 * Mismo gate que `/api/agente`. Tope 4 MB porque Vercel corta el body en 4.5.
 */
import { NextResponse } from 'next/server'
import { sesionAsistente } from '@/lib/agente/sesion'
import { extraerTexto } from '@/lib/agente/adjuntos'
import { MAX_BYTES_ADJUNTO, MENSAJE_PESO_ADJUNTO, MENSAJE_TIPO_ADJUNTO, tipoAdjunto } from '@/lib/agente/adjunto-texto'

// La transcripción de una imagen puede tardar; el default de 15 s la mata a medias.
export const maxDuration = 60

export async function POST(req: Request) {
  const sesion = await sesionAsistente()
  if (!sesion.ok) return sesion.respuesta

  const fd = await req.formData().catch(() => null)
  const archivo = fd?.get('archivo')
  if (!(archivo instanceof File) || archivo.size === 0) {
    return NextResponse.json({ error: 'No llegó ningún archivo.' }, { status: 400 })
  }
  if (archivo.size > MAX_BYTES_ADJUNTO) {
    return NextResponse.json({ error: MENSAJE_PESO_ADJUNTO }, { status: 413 })
  }
  if (!tipoAdjunto(archivo.name, archivo.type)) {
    return NextResponse.json({ error: MENSAJE_TIPO_ADJUNTO }, { status: 415 })
  }

  const r = await extraerTexto({
    name: archivo.name,
    type: archivo.type,
    bytes: new Uint8Array(await archivo.arrayBuffer()),
  })
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: 422 })
  return NextResponse.json({ nombre: archivo.name, texto: r.texto, recortado: r.recortado })
}

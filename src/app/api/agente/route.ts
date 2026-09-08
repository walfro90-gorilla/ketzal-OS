/**
 * El asistente del OS. Solo superadmin (ADR-0044): escalarlo a los admins de
 * agencia es quitar ese `if`, porque las herramientas ya corren con el JWT de
 * quien pregunta y la RLS acota lo demás.
 *
 * Respuesta: NDJSON de eventos (`Evento`), uno por línea, conforme pasan.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { tokenScope } from '../../../../mcp/src/session'
import { correr, promptSistema, type Evento } from '@/lib/agente/conversacion'
import { LlmError, type Mensaje } from '@/lib/agente/llm'
import { sesionAsistente } from '@/lib/agente/sesion'

const esquemaCuerpo = z.object({
  mensajes: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant', 'tool']),
        content: z.string().max(200_000).nullable(),
        tool_calls: z
          .array(
            z.object({
              id: z.string(),
              type: z.literal('function'),
              function: z.object({ name: z.string(), arguments: z.string() }),
            }),
          )
          .optional(),
        tool_call_id: z.string().optional(),
      }),
    )
    .max(200),
  aprobados: z.array(z.string()).max(20).default([]),
})

export async function POST(req: Request) {
  // Sesión + superadmin + el JWT de la cookie con el que corren las
  // herramientas (nunca service role). Compartido con /api/agente/adjunto.
  const sesion = await sesionAsistente()
  if (!sesion.ok) return sesion.respuesta
  const { token } = sesion

  const cuerpo = esquemaCuerpo.safeParse(await req.json().catch(() => null))
  if (!cuerpo.success) return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 })
  const historial = cuerpo.data.mensajes as Mensaje[]
  const aprobados = new Set(cuerpo.data.aprobados)
  const sistema = promptSistema({ nombre: sesion.nombre, email: sesion.email })

  const enc = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emitir = (e: Evento) => controller.enqueue(enc.encode(JSON.stringify(e) + '\n'))
      try {
        await tokenScope.run(token, () => correr(historial, aprobados, sistema, emitir))
      } catch (e) {
        if (!(e instanceof LlmError)) console.error('[agente]', e)
        emitir({
          tipo: 'error',
          texto: e instanceof LlmError ? e.message : 'El asistente falló. Intenta de nuevo.',
        })
      } finally {
        controller.close()
      }
    },
  })
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

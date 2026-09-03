import { describe, expect, it } from 'vitest'
import type { ToolDef } from '../../../mcp/src/tools/registry'
import { correr, MAX_PASOS, pendientes, recortar, type Deps, type Evento } from './conversacion'
import type { Mensaje, ToolCall } from './llm'

const lectura: ToolDef = { name: 'leer', title: 'Leer', description: 'd', handler: async () => 'x' }
const dinero: ToolDef = { name: 'abonar', title: 'Abonar', description: 'd', write: true, money: true, handler: async () => 'x' }
const call = (id: string, name: string, args = '{}'): ToolCall => ({ id, type: 'function', function: { name, arguments: args } })
const conTools = (...calls: ToolCall[]): Mensaje => ({ role: 'assistant', content: null, tool_calls: calls })
const texto = (t: string): Mensaje => ({ role: 'assistant', content: t })

/** LLM de mentira: devuelve los mensajes en orden y anota qué se ejecutó. */
function armar(respuestas: Mensaje[]) {
  const ejecutadas: string[] = []
  let i = 0
  const deps: Deps = {
    completar: async () => ({ mensaje: respuestas[Math.min(i++, respuestas.length - 1)]!, proveedor: 'fake' }),
    ejecutar: async (t, args) => {
      ejecutadas.push(`${t.name}:${JSON.stringify(args)}`)
      return { ok: true, texto: `resultado de ${t.name}` }
    },
    buscar: (n) => [lectura, dinero].find((t) => t.name === n),
    tools: [],
  }
  const eventos: Evento[] = []
  const run = (historial: Mensaje[], aprobados: string[] = []) =>
    correr(historial, new Set(aprobados), 'sistema', (e) => eventos.push(e), deps)
  const fin = () => (eventos.find((e) => e.tipo === 'fin') as { mensajes: Mensaje[] }).mensajes
  const tipos = () => eventos.map((e) => e.tipo)
  return { run, eventos, ejecutadas, fin, tipos, llamadasLlm: () => i }
}

describe('correr', () => {
  it('texto directo: un turno, sin herramientas', async () => {
    const f = armar([texto('hola')])
    await f.run([{ role: 'user', content: 'hey' }])
    expect(f.tipos()).toEqual(['texto', 'fin'])
    expect(f.fin().map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(f.fin()[0]).toEqual({ role: 'user', content: 'hey' })
  })

  it('lectura: ejecuta, mete el resultado como tool y vuelve al LLM', async () => {
    const f = armar([conTools(call('c1', 'leer', '{"q":1}')), texto('listo')])
    await f.run([{ role: 'user', content: 'lee' }])
    expect(f.tipos()).toEqual(['tool', 'resultado', 'texto', 'fin'])
    expect(f.ejecutadas).toEqual(['leer:{"q":1}'])
    expect(f.fin().at(-2)).toEqual({ role: 'tool', tool_call_id: 'c1', content: 'resultado de leer' })
  })

  it('dinero sin aprobación: pide confirmar y se corta SIN ejecutar', async () => {
    const f = armar([conTools(call('m1', 'abonar', '{"monto":100}')), texto('nunca')])
    await f.run([{ role: 'user', content: 'abona' }])
    expect(f.tipos()).toEqual(['confirmar', 'fin'])
    expect(f.ejecutadas).toEqual([])
    expect(f.eventos[0]).toMatchObject({ tipo: 'confirmar', id: 'm1', herramienta: 'abonar', args: { monto: 100 } })
    // El turno con la tool_call queda en el historial para retomarlo.
    expect(f.fin().at(-1)?.tool_calls?.[0]?.id).toBe('m1')
  })

  it('reanuda con el id aprobado: ejecuta sin volver a preguntar', async () => {
    const f = armar([texto('abonado')])
    await f.run([{ role: 'user', content: 'abona' }, conTools(call('m1', 'abonar', '{"monto":100}'))], ['m1'])
    expect(f.tipos()).toEqual(['tool', 'resultado', 'texto', 'fin'])
    expect(f.ejecutadas).toEqual(['abonar:{"monto":100}'])
    expect(f.llamadasLlm()).toBe(1)
  })

  it('cancelación: el mensaje tool del cliente cierra el turno y el LLM solo contesta', async () => {
    const f = armar([texto('ok, no lo hago')])
    await f.run([
      { role: 'user', content: 'abona' },
      conTools(call('m1', 'abonar')),
      { role: 'tool', tool_call_id: 'm1', content: 'La persona canceló.' },
    ])
    expect(f.ejecutadas).toEqual([])
    expect(f.tipos()).toEqual(['texto', 'fin'])
  })

  it('paralelo: corre la lectura y se detiene en la de dinero; al reanudar no repite la lectura', async () => {
    const f = armar([conTools(call('c1', 'leer'), call('m1', 'abonar')), texto('fin')])
    await f.run([{ role: 'user', content: 'x' }])
    expect(f.tipos()).toEqual(['tool', 'resultado', 'confirmar', 'fin'])
    const g = armar([texto('fin')])
    await g.run(f.fin(), ['m1'])
    expect(g.ejecutadas).toEqual(['abonar:{}'])
  })

  it('herramienta desconocida o args rotos: error como resultado, no caída', async () => {
    const f = armar([conTools(call('c1', 'nada'), call('c2', 'leer', '[1]')), texto('ok')])
    await f.run([{ role: 'user', content: 'x' }])
    expect(f.ejecutadas).toEqual([])
    const tools = f.fin().filter((m) => m.role === 'tool').map((m) => m.content)
    expect(tools[0]).toMatch(/no existe la herramienta nada/)
    expect(tools[1]).toMatch(/JSON válido/)
  })

  it('freno anti-bucle: tras MAX_PASOS tira el último turno con tool_calls', async () => {
    const f = armar([conTools(call('c', 'leer'))])
    await f.run([{ role: 'user', content: 'x' }])
    expect(f.llamadasLlm()).toBe(MAX_PASOS)
    expect(f.eventos.at(-2)).toMatchObject({ tipo: 'texto', texto: expect.stringMatching(/Me detuve/) })
    expect(f.fin().at(-1)?.role).toBe('tool')
    expect(pendientes(f.fin())).toEqual([])
  })
})

describe('pendientes / recortar', () => {
  it('pendientes = tool_calls del último assistant sin mensaje tool', () => {
    const conv: Mensaje[] = [
      { role: 'user', content: 'x' },
      conTools(call('a', 'leer'), call('b', 'abonar')),
      { role: 'tool', tool_call_id: 'a', content: 'ok' },
    ]
    expect(pendientes(conv).map((c) => c.id)).toEqual(['b'])
    expect(pendientes([{ role: 'user', content: 'x' }, texto('hola')])).toEqual([])
  })
  it('recortar nunca parte un turno: arranca en el primer user de la ventana', () => {
    const conv: Mensaje[] = [
      { role: 'user', content: '1' },
      conTools(call('a', 'leer')),
      { role: 'tool', tool_call_id: 'a', content: 'ok' },
      texto('r1'),
      { role: 'user', content: '2' },
      texto('r2'),
    ]
    expect(recortar(conv, 4).map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(recortar(conv, 10)).toBe(conv)
    expect(recortar(conv, 1)).toEqual([])
  })
})

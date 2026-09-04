import { describe, expect, it } from 'vitest'
import { desempacar, empacar, etiquetaDeFecha, MAX_BYTES, MAX_ITEMS } from './historial'
import type { Mensaje } from './llm'

const user = (t: string): Mensaje => ({ role: 'user', content: t })
const tool = (id: string, n: number): Mensaje => ({ role: 'tool', tool_call_id: id, content: 'x'.repeat(n) })
const conTools = (id: string): Mensaje => ({
  role: 'assistant', content: null,
  tool_calls: [{ id, type: 'function', function: { name: 'f', arguments: '{}' } }],
})

describe('empacar / desempacar', () => {
  it('ida y vuelta conserva el hilo y la fecha', () => {
    const msgs = [user('hola'), { role: 'assistant', content: 'qué tal' } as Mensaje]
    const g = desempacar<string>(empacar(['a', 'b'], msgs, 1_700_000_000_000))
    expect(g).toEqual({ v: 1, guardadoEn: 1_700_000_000_000, items: ['a', 'b'], mensajes: msgs })
  })

  it('recorta hasta caber en la cuota', () => {
    // 10 turnos con resultados de 200k: sin tope serían ~2 MB.
    const msgs: Mensaje[] = []
    for (let i = 0; i < 10; i++) msgs.push(user(`p${i}`), conTools(`c${i}`), tool(`c${i}`, 200_000))
    const raw = empacar([], msgs)
    expect(raw.length).toBeLessThanOrEqual(MAX_BYTES)
    expect(desempacar<string>(raw)!.mensajes.length).toBeGreaterThan(0)
  })

  it('aunque UN solo mensaje reviente la cuota, no se cuelga y devuelve algo válido', () => {
    const raw = empacar([], [user('p'), conTools('c'), tool('c', MAX_BYTES * 2)])
    expect(desempacar<string>(raw)).not.toBeNull()
    expect(raw.length).toBeLessThan(MAX_BYTES * 3)
  })

  it('nunca deja un turno partido: si hay mensajes, el primero es del usuario', () => {
    const msgs: Mensaje[] = []
    for (let i = 0; i < 8; i++) msgs.push(user(`p${i}`), conTools(`c${i}`), tool(`c${i}`, 150_000))
    const guardado = desempacar<string>(empacar([], msgs))!
    if (guardado.mensajes.length) expect(guardado.mensajes[0]!.role).toBe('user')
  })

  it('topa las burbujas y se queda con las últimas', () => {
    const items = Array.from({ length: MAX_ITEMS + 40 }, (_, i) => i)
    const g = desempacar<number>(empacar(items, [user('x')]))!
    expect(g.items).toHaveLength(MAX_ITEMS)
    expect(g.items.at(-1)).toBe(MAX_ITEMS + 39)
  })

  it('basura, versión vieja o vacío ⇒ null (el hilo empieza limpio)', () => {
    expect(desempacar(null)).toBeNull()
    expect(desempacar('no soy json')).toBeNull()
    expect(desempacar('{"v":0,"items":[],"mensajes":[]}')).toBeNull()
    expect(desempacar('{"v":1,"items":"x","mensajes":[]}')).toBeNull()
  })
})

describe('etiquetaDeFecha', () => {
  // 2026-09-03 18:00 en Chihuahua (UTC-6) = 2026-09-04 00:00Z: el mismo instante
  // cae en OTRO día si se lee en UTC. La etiqueta usa la zona de la operación.
  const anoche = Date.parse('2026-09-04T00:00:00Z')
  const hoy = Date.parse('2026-09-04T20:00:00Z')

  it('no etiqueta lo de hoy ni lo que no trae fecha', () => {
    expect(etiquetaDeFecha(hoy, hoy)).toBeNull()
    expect(etiquetaDeFecha(anoche, anoche)).toBeNull()
    expect(etiquetaDeFecha(0, hoy)).toBeNull()
  })

  it('un hilo de otro día avisa que los montos son de ese día', () => {
    const ayer = Date.parse('2026-09-02T18:00:00Z')
    expect(etiquetaDeFecha(ayer, hoy)).toBe('Conversación del 2 de septiembre. Los montos son de ese día.')
  })

  it('mismo día en Chihuahua aunque en UTC ya sea el siguiente', () => {
    // anoche y hoy son el 3 y el 4 en UTC, pero ambos el 3 y 4 en Chihuahua:
    // 2026-09-04T00:00Z = 3 sep 18:00 en Chihuahua.
    expect(etiquetaDeFecha(anoche, Date.parse('2026-09-04T05:00:00Z'))).toBeNull()
  })
})

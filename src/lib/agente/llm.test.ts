import { describe, expect, it } from 'vitest'
import { completar, esRecuperable, LlmError, proveedores, type Proveedor } from './llm'

const lista: Proveedor[] = [
  { nombre: 'groq', url: 'https://groq', key: 'a', modelo: 'm1' },
  { nombre: 'gemini', url: 'https://gemini', key: 'b', modelo: 'm2' },
  { nombre: 'deepseek', url: 'https://deepseek', key: 'c', modelo: 'm3' },
]
const ok = (texto: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content: texto } }] }), { status: 200 })
const fetchPor = (plan: Record<string, () => Response | Promise<Response>>) => {
  const llamadas: string[] = []
  const fn = (async (url: string | URL | Request) => {
    llamadas.push(String(url))
    return plan[String(url)]!()
  }) as typeof fetch
  return { fn, llamadas }
}

describe('proveedores', () => {
  it('solo los que tienen llave, en orden groq → gemini → deepseek', () => {
    expect(proveedores({})).toEqual([])
    expect(proveedores({ DEEPSEEK_API_KEY: 'x', GROQ_API_KEY: 'y' }).map((p) => p.nombre)).toEqual([
      'groq',
      'deepseek',
    ])
  })
  it('recuperable = 429 o 5xx', () => {
    expect([429, 500, 503].every(esRecuperable)).toBe(true)
    expect([400, 401, 404].some(esRecuperable)).toBe(false)
  })
})

describe('completar', () => {
  it('sin proveedores explica qué falta', async () => {
    await expect(completar([], [], [])).rejects.toThrow(/GROQ_API_KEY/)
  })
  it('salta al siguiente con 5xx, 429 y red', async () => {
    const { fn, llamadas } = fetchPor({
      'https://groq': () => new Response('boom', { status: 503 }),
      'https://gemini': () => Promise.reject(new Error('ECONNRESET')),
      'https://deepseek': () => ok('hola'),
    })
    const r = await completar([{ role: 'user', content: 'x' }], [], lista, fn)
    expect(r.proveedor).toBe('deepseek')
    expect(r.mensaje).toEqual({ role: 'assistant', content: 'hola' })
    expect(llamadas).toEqual(['https://groq', 'https://gemini', 'https://deepseek'])
  })
  it('un 4xx es bug nuestro: se reporta, NO se prueba con otro', async () => {
    const { fn, llamadas } = fetchPor({
      'https://groq': () => new Response('bad', { status: 400 }),
      'https://gemini': () => ok('nunca'),
    })
    await expect(completar([], [], lista, fn)).rejects.toThrow(LlmError)
    expect(llamadas).toEqual(['https://groq'])
  })
  it('si todos fallan, dice quién falló con qué', async () => {
    const { fn } = fetchPor({
      'https://groq': () => new Response('', { status: 500 }),
      'https://gemini': () => new Response('', { status: 429 }),
      'https://deepseek': () => new Response('{}', { status: 200 }),
    })
    await expect(completar([], [], lista, fn)).rejects.toThrow(
      'Ningún LLM respondió (groq: HTTP 500, gemini: HTTP 429, deepseek: sin respuesta).',
    )
  })
  it('manda tools y tool_choice solo si hay herramientas; conserva tool_calls', async () => {
    let cuerpo: Record<string, unknown> = {}
    const fn = (async (_u: string | URL | Request, init?: RequestInit) => {
      cuerpo = JSON.parse(String(init?.body))
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: null, tool_calls: [{ id: '1', type: 'function', function: { name: 'f', arguments: '{}' } }] } }],
        }),
      )
    }) as typeof fetch
    const spec = { type: 'function' as const, function: { name: 'f', description: 'd', parameters: {} } }
    const r = await completar([], [spec], [lista[0]!], fn)
    expect(cuerpo.tools).toEqual([spec])
    expect(cuerpo.tool_choice).toBe('auto')
    expect(r.mensaje.tool_calls?.[0]?.function.name).toBe('f')
    await completar([], [], [lista[0]!], fn)
    expect(cuerpo.tools).toBeUndefined()
  })
})

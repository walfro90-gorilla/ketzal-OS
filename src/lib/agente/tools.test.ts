import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { KetzalError } from '../../../mcp/src/errors'
import { ALL_TOOLS } from '../../../mcp/src/tools/index'
import type { ToolDef } from '../../../mcp/src/tools/tipos'
import { ejecutar, especificaciones, HERRAMIENTAS, MAX_CHARS, pideConfirmacion } from './tools'

describe('especificaciones', () => {
  it('todas las del MCP menos subir_fotos, como funciones OpenAI válidas', () => {
    const specs = especificaciones()
    expect(specs).toHaveLength(ALL_TOOLS.length - 1)
    expect(HERRAMIENTAS.some((t) => t.name === 'ketzal_subir_fotos')).toBe(false)
    for (const s of specs) {
      expect(s.function.name).toMatch(/^ketzal_/)
      expect(s.function.description.length).toBeGreaterThan(20)
      expect(s.function.parameters.type).toBe('object')
      expect(s.function.parameters.$schema).toBeUndefined()
    }
  })
  it('`confirmar` NO se le enseña al modelo (lo pone el servidor tras el clic)', () => {
    const dinero = HERRAMIENTAS.filter((t) => t.money)
    expect(dinero.length).toBeGreaterThan(0)
    // En el ToolDef sí está (el guard del MCP lo exige)...
    expect(dinero.every((t) => 'confirmar' in (t.inputSchema!.shape as object))).toBe(true)
    // ...pero jamás llega al schema que ve el LLM. Si llega, el modelo lo llena
    // y un valor inválido tumba la petición entera con un 400 del proveedor.
    for (const s of especificaciones(dinero)) {
      const p = s.function.parameters as { properties?: object; required?: string[] }
      expect(p.properties).not.toHaveProperty('confirmar')
      expect(p.required ?? []).not.toContain('confirmar')
    }
  })

  it('dinero y destructivas piden clic; las lecturas no', () => {
    const dinero = HERRAMIENTAS.filter((t) => t.money).map((t) => t.name)
    expect(dinero).toContain('ketzal_registrar_abono')
    expect(HERRAMIENTAS.filter(pideConfirmacion).map((t) => t.name)).toEqual(
      expect.arrayContaining(dinero),
    )
    expect(pideConfirmacion(HERRAMIENTAS.find((t) => t.name === 'ketzal_clientes')!)).toBe(false)
  })
})

describe('ejecutar', () => {
  const def = (h: ToolDef['handler'], extra: Partial<ToolDef> = {}): ToolDef => ({
    name: 't', title: 'T', description: 'd', handler: h, ...extra,
  })
  it('serializa el valor y trunca al tope', async () => {
    expect(await ejecutar(def(async () => ({ a: 1 })), {})).toEqual({ ok: true, texto: '{"a":1}' })
    const r = await ejecutar(def(async () => 'x'.repeat(MAX_CHARS + 5)), {})
    expect(r.texto.length).toBeLessThan(MAX_CHARS + 200)
    expect(r.texto).toMatch(/truncado/)
  })
  it('la de dinero recibe confirmar:true (el clic ya lo dio la persona)', async () => {
    let visto: unknown
    await ejecutar(def(async (a) => { visto = a; return 1 }, { money: true }), { monto: 5 })
    expect(visto).toEqual({ monto: 5, confirmar: true })
  })
  it('KetzalError y ZodError se le explican al modelo; el resto se esconde', async () => {
    expect(await ejecutar(def(async () => { throw new KetzalError('No hay cupo') }), {})).toEqual({
      ok: false, texto: 'Error: No hay cupo',
    })
    const conZod = def(async (a) => z.object({ n: z.number() }).parse(a))
    expect((await ejecutar(conZod, { n: 'x' })).texto).toMatch(/Error: .*n/)
    expect(await ejecutar(def(async () => { throw new Error('secreto') }), {})).toEqual({
      ok: false, texto: 'Error: No se pudo completar la operación.',
    })
  })
})

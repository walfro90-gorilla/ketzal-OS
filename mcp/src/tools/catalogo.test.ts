import { describe, expect, it } from 'vitest'
import { fechaSolo, limpiarPacks, normalizarOverrides, patchSalida, patchServicio } from './catalogo.js'

describe('limpiarPacks', () => {
  it('deduplica, ordena canónico y sella el label', () => {
    const packs = limpiarPacks([
      { tipo: 'triple', precio: 2000 },
      { tipo: 'doble', precio: 2500.005 },
      { tipo: 'doble', precio: 2400 },
    ])
    expect(packs.map((p) => p.key)).toEqual(['doble', 'triple'])
    expect(packs[0]).toEqual({ key: 'doble', label: 'Doble (2 personas)', price: 2400 })
  })

  it('descarta tipos desconocidos y precios inválidos', () => {
    expect(limpiarPacks([{ tipo: 'quintuple', precio: 100 }])).toEqual([])
    expect(limpiarPacks([{ tipo: 'doble', precio: -1 }])).toEqual([])
  })
})

describe('patchServicio', () => {
  it('sólo incluye los campos mandados: editar el nombre no borra lo demás', () => {
    expect(patchServicio({ nombre: '  Creel  ' })).toEqual({ name: 'Creel' })
  })

  it('deriva el precio "desde" del pack más barato (b046)', () => {
    const p = patchServicio({ paquetes: [{ tipo: 'doble', precio: 2500 }, { tipo: 'cuadruple', precio: 1900 }] })
    expect(p.price).toBe(1900)
  })

  it('sin paquetes el precio derivado es 0, no undefined', () => {
    expect(patchServicio({ paquetes: [] }).price).toBe(0)
  })

  it('rechaza nombre vacío y cupo no entero positivo', () => {
    expect(() => patchServicio({ nombre: '   ' })).toThrow(/nombre/)
    expect(() => patchServicio({ cupo: 0 })).toThrow(/cupo/)
    expect(() => patchServicio({ cupo: 2.5 })).toThrow(/cupo/)
  })

  it('null limpia el campo en vez de omitirlo', () => {
    expect(patchServicio({ transporte: null })).toEqual({ transport_type: null })
    expect(patchServicio({ descripcion: null })).toEqual({ description: null })
  })

  it('las preguntas frecuentes viajan como {question, answer}', () => {
    const p = patchServicio({ preguntas: [{ pregunta: '¿Incluye comidas?', respuesta: 'Sí' }] })
    expect(p.faqs).toEqual([{ question: '¿Incluye comidas?', answer: 'Sí' }])
  })

  it('el itinerario descarta días sin título', () => {
    const p = patchServicio({
      itinerario: [{ titulo: 'Día 1', descripcion: 'Salida' }, { titulo: '  ' }],
    })
    expect(p.itinerary).toEqual([{ title: 'Día 1', description: 'Salida' }])
  })
})

describe('fechaSolo', () => {
  it('acepta una fecha real y rechaza una inexistente', () => {
    expect(fechaSolo('2026-12-30')).toBe('2026-12-30')
    expect(() => fechaSolo('2026-02-31')).toThrow(/no existe/)
    expect(() => fechaSolo('30/12/2026')).toThrow(/AAAA-MM-DD/)
  })
})

describe('patchSalida', () => {
  it('acota el ajuste de temporada', () => {
    expect(patchSalida({ ajuste_pct: 25 }).price_pct).toBe(25)
    expect(() => patchSalida({ ajuste_pct: -100 })).toThrow(/ajuste/)
    expect(() => patchSalida({ ajuste_pct: 501 })).toThrow(/ajuste/)
  })

  it('valida los precios especiales por paquete (b057)', () => {
    expect(normalizarOverrides({ doble: 2699 })).toEqual({ doble: 2699 })
    expect(normalizarOverrides({})).toBeNull()
    expect(normalizarOverrides(null)).toBeNull()
    expect(() => normalizarOverrides({ suite: 100 })).toThrow(/Paquete inválido/)
    expect(() => normalizarOverrides({ doble: 0 })).toThrow(/mayor a 0/)
  })
})

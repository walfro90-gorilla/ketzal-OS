import { describe, it, expect } from 'vitest'
import {
  COSTEO_VACIO,
  costoPorPax,
  fijos,
  habitacionPorPax,
  limpiarCosteo,
  limpiarTarifario,
  margenA,
  margenAddon,
  packReferencia,
  precioSugerido,
  puntoEquilibrio,
  tablaPorPack,
  unidades,
  variablesPorPax,
  type CostLine,
  type Costeo,
} from './costeo'

// Regla de negocio (ADR-0055): el costeo es un plan con cuatro unidades que
// escalan distinto con N. Fixture de referencia: sprinter de 15 a $8,000 por
// viaje, guía a $1,500/día por 3 días, hotel doble $1,200 y sencilla $2,000 por
// noche (2 noches), entrada $100 por persona. Margen 30 sobre el precio.

const linea = (l: Partial<CostLine> & Pick<CostLine, 'unit' | 'label'>): CostLine => ({
  supplier_id: 'p1',
  supplier_name: 'Proveedor',
  rate_key: l.label.toLowerCase(),
  qty: 1,
  ...l,
})

const doc: Costeo = {
  plan_pax: 16,
  nights: 2,
  days: 3,
  margin_pct: 30,
  lines: [
    linea({ unit: 'grupo', label: 'Sprinter', cost: 8000, cap: 15 }),
    linea({ unit: 'dia', label: 'Guía', cost: 1500 }),
    linea({ unit: 'habitacion', label: 'Hotel', cost_by_pack: { doble: 1200, sencilla: 2000 } }),
    linea({ unit: 'pax', label: 'Entrada', cost: 100 }),
  ],
  addon_costs: {},
}

describe('unidades', () => {
  it('sin cap ⇒ 1 sin importar N', () => {
    expect(unidades({}, 40)).toBe(1)
  })
  it('cap 15: a 15 pax una unidad, a 16 dos', () => {
    expect(unidades({ cap: 15 }, 15)).toBe(1)
    expect(unidades({ cap: 15 }, 16)).toBe(2)
  })
})

describe('fijos / variablesPorPax / habitacionPorPax', () => {
  it('los fijos escalonan con la segunda sprinter: 12,500 a 15 pax, 20,500 a 16', () => {
    expect(fijos(doc, 15)).toBe(8000 + 1500 * 3)
    expect(fijos(doc, 16)).toBe(16000 + 1500 * 3)
  })
  it('lo variable es por persona y no depende de N', () => {
    expect(variablesPorPax(doc)).toBe(100)
  })
  it('hospedaje por pax: doble 1,200/2·2 noches = 1,200; sencilla 2,000/1·2 = 4,000', () => {
    expect(habitacionPorPax(doc, 'doble')).toBe(1200)
    expect(habitacionPorPax(doc, 'sencilla')).toBe(4000)
  })
  it('pack que el hotel no ofrece ⇒ null, no NaN ni 0', () => {
    expect(habitacionPorPax(doc, 'triple')).toBeNull()
  })
})

describe('costoPorPax / precioSugerido', () => {
  it('doble a 16 pax: 20,500/16 + 100 + 1,200 = 2,581.25 ⇒ sugerido ceil(2,581.25/0.7) = 3,688', () => {
    expect(costoPorPax(doc, 'doble', 16)).toBeCloseTo(2581.25, 2)
    expect(precioSugerido(doc, 'doble', 16)).toBe(3688)
  })
  it('doble a 15 pax es más barato por pax (una sola sprinter): 2,133.33 ⇒ 3,048', () => {
    expect(costoPorPax(doc, 'doble', 15)).toBeCloseTo(12500 / 15 + 1300, 2)
    expect(precioSugerido(doc, 'doble', 15)).toBe(3048)
  })
  it('N = 0 no divide entre cero ⇒ null', () => {
    expect(costoPorPax(doc, 'doble', 0)).toBeNull()
    expect(precioSugerido(doc, 'doble', 0)).toBeNull()
  })
  it('margen 0 ⇒ el sugerido es el costo redondeado a peso hacia arriba', () => {
    expect(precioSugerido({ ...doc, margin_pct: 0 }, 'doble', 16)).toBe(2582)
  })
  it('pack sin hospedaje ⇒ sin costo ni sugerido', () => {
    expect(precioSugerido(doc, 'triple', 16)).toBeNull()
  })
  it('sin líneas de habitación el pack no importa: solo fijos + variables', () => {
    const sinHotel = { ...doc, lines: doc.lines.filter((l) => l.unit !== 'habitacion') }
    expect(costoPorPax(sinHotel, 'cuadruple', 16)).toBeCloseTo(20500 / 16 + 100, 2)
  })
})

describe('margenA / puntoEquilibrio', () => {
  it('a $3,000 la doble gana a partir de 8 pax (1,700·8 ≥ 12,500)', () => {
    expect(puntoEquilibrio(doc, 'doble', 40, 3000)).toBe(8)
    expect(margenA(doc, 'doble', 7, 3000)!.utilidad).toBeLessThan(0)
    expect(margenA(doc, 'doble', 8, 3000)!.utilidad).toBeGreaterThanOrEqual(0)
  })
  it('el escalón de la segunda sprinter: a $2,150 empata en 15 y a 16 vuelve a perder', () => {
    expect(puntoEquilibrio(doc, 'doble', 40, 2150)).toBe(15)
    expect(margenA(doc, 'doble', 16, 2150)!.utilidad).toBeLessThan(0)
  })
  it('precio que no cubre lo variable + hospedaje ⇒ nunca empata ⇒ null', () => {
    expect(puntoEquilibrio(doc, 'doble', 100, 1300)).toBeNull()
    expect(puntoEquilibrio(doc, 'doble', 100, 1000)).toBeNull()
  })
  it('margen en % es utilidad ÷ ingreso', () => {
    const m = margenA(doc, 'doble', 16, 3688)!
    expect(m.ingreso).toBe(3688 * 16)
    expect(m.pct).toBeCloseTo(((3688 - 2581.25) / 3688) * 100, 6)
  })
})

describe('packReferencia / tablaPorPack / margenAddon', () => {
  it('doble si existe; si no, el más barato; sin packs ⇒ null', () => {
    const packs = [
      { key: 'sencilla' as const, label: 'S', price: 5000 },
      { key: 'doble' as const, label: 'D', price: 3500 },
    ]
    expect(packReferencia(packs)!.key).toBe('doble')
    expect(packReferencia([packs[0], { key: 'triple', label: 'T', price: 3000 }])!.key).toBe('triple')
    expect(packReferencia([])).toBeNull()
  })
  it('una fila por pack con costo, sugerido y margen al precio actual; "—" (null) donde no hay hospedaje', () => {
    const t = tablaPorPack(doc, [
      { key: 'doble', label: 'D', price: 3500 },
      { key: 'triple', label: 'T', price: 3000 },
    ])
    expect(t[0].sugerido).toBe(3688)
    expect(t[0].margen!.utilidad).toBeCloseTo((3500 - 2581.25) * 16, 2)
    expect(t[1].costo).toBeNull()
    expect(t[1].margen).toBeNull()
  })
  it('el margen de un extra es precio − costo; sin costo, todo el precio', () => {
    const tirolesa = { key: 'tirolesa', label: 'Tirolesa', price: 450 }
    expect(margenAddon(tirolesa, { cost: 350 })).toBe(100)
    expect(margenAddon(tirolesa)).toBe(450)
  })
})

describe('limpiarTarifario', () => {
  it('sin entrada ⇒ []', () => {
    expect(limpiarTarifario()).toEqual([])
  })
  it('sella la key desde el nombre y desempata colisiones con sufijo', () => {
    const r = limpiarTarifario([
      { label: 'Camioneta', unit: 'grupo', cost: 8000 },
      { label: 'Camioneta', unit: 'grupo', cost: 9500 },
      { label: 'Camioneta', unit: 'grupo', cost: 11000 },
    ])
    expect(r.map((x) => x.key)).toEqual(['camioneta', 'camioneta-2', 'camioneta-3'])
    expect(r.map((x) => x.cost)).toEqual([8000, 9500, 11000])
  })
  it('descarta unidad desconocida, costo negativo y nombre vacío; acepta costo 0', () => {
    const r = limpiarTarifario([
      { label: 'Raro', unit: 'hora', cost: 10 },
      { label: 'Negativo', unit: 'pax', cost: -1 },
      { label: '  ', unit: 'pax', cost: 10 },
      { label: 'Cortesía', unit: 'pax', cost: 0 },
    ])
    expect(r).toEqual([{ key: 'cortesia', label: 'Cortesía', unit: 'pax', cost: 0 }])
  })
  it('habitación: solo packs conocidos con costo > 0; sin ninguno se descarta; ignora cost y cap', () => {
    const r = limpiarTarifario([
      { label: 'Hotel', unit: 'habitacion', cost: 99, cap: 4, cost_by_pack: { doble: '1200', sencilla: '', quintuple: 5 } },
      { label: 'Sin packs', unit: 'habitacion', cost_by_pack: { doble: 0 } },
    ])
    expect(r).toEqual([{ key: 'hotel', label: 'Hotel', unit: 'habitacion', cost_by_pack: { doble: 1200 } }])
  })
  it('cap: entero > 0 solo en grupo/día; strings numéricos se aceptan', () => {
    const r = limpiarTarifario([
      { label: 'Sprinter', unit: 'grupo', cost: '8000', cap: '15.9' },
      { label: 'Guía', unit: 'dia', cost: 1500, cap: 0 },
      { label: 'Entrada', unit: 'pax', cost: 100, cap: 3 },
    ])
    expect(r[0]).toEqual({ key: 'sprinter', label: 'Sprinter', unit: 'grupo', cost: 8000, cap: 15 })
    expect(r[1].cap).toBeUndefined()
    expect(r[2].cap).toBeUndefined()
  })
})

describe('limpiarCosteo', () => {
  it('sin entrada ⇒ el costeo vacío (pax 1, 1 día, 0 noches, margen 30)', () => {
    expect(limpiarCosteo(undefined, [])).toEqual(COSTEO_VACIO)
  })
  it('normaliza la cabecera: pax y días mínimo 1, noches mínimo 0, margen en [0, 99]', () => {
    const c = limpiarCosteo({ plan_pax: 0, days: -2, nights: 'x', margin_pct: 150 }, [])
    expect([c.plan_pax, c.days, c.nights, c.margin_pct]).toEqual([1, 1, 0, 99])
    expect(limpiarCosteo({ margin_pct: -5 }, []).margin_pct).toBe(0)
    expect(limpiarCosteo({ plan_pax: 16.7, days: 3 }, []).nights).toBe(2)
  })
  it('descarta líneas sin proveedor o con tarifa inválida; qty inválido ⇒ 1; habitación sin qty', () => {
    const c = limpiarCosteo(
      {
        lines: [
          { supplier_id: '', supplier_name: 'X', rate_key: 'a', label: 'Sin dueño', unit: 'pax', cost: 1 },
          { supplier_id: 'p1', supplier_name: 'P', rate_key: 'b', label: 'Mal', unit: 'hora', cost: 1 },
          { supplier_id: 'p1', supplier_name: 'P', rate_key: 'c', label: 'Comida', unit: 'pax', cost: 120, qty: 'dos' },
          { supplier_id: 'p1', supplier_name: 'P', rate_key: 'd', label: 'Hotel', unit: 'habitacion', qty: 7, cost_by_pack: { doble: 1200 } },
        ],
      },
      []
    )
    expect(c.lines.map((l) => [l.label, l.qty])).toEqual([
      ['Comida', 1],
      ['Hotel', 1],
    ])
  })
  it('conserva el costo de un add-on que existe y tira el huérfano', () => {
    const c = limpiarCosteo(
      { addon_costs: { tirolesa: { cost: '350', supplier_id: 'p9', supplier_name: 'Tiro' }, vieja: { cost: 10 }, mala: { cost: -1 } } },
      ['tirolesa', 'mala']
    )
    expect(c.addon_costs).toEqual({ tirolesa: { cost: 350, supplier_id: 'p9', supplier_name: 'Tiro' } })
  })
  it('un proveedor borrado no rompe nada: la línea conserva nombre y costo copiados', () => {
    const c = limpiarCosteo({ plan_pax: 10, days: 3, nights: 2, lines: doc.lines }, [])
    expect(c.lines).toHaveLength(4)
    expect(costoPorPax(c, 'doble', 10)).toBeCloseTo(12500 / 10 + 100 + 1200, 2)
  })
})

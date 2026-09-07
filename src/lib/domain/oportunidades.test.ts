import { describe, expect, it } from 'vitest'
import { oportunidades, paraAvisar, temporadaPorId, type ServicioParaHuecos } from './oportunidades'

const creel: ServicioParaHuecos = { id: 'creel', name: 'Creel', duration_days: 3, meses_ideales: null }
const huasteca: ServicioParaHuecos = {
  id: 'huasteca',
  name: 'Huasteca',
  duration_days: 4,
  meses_ideales: [3, 4, 5, 10, 11, 12], // nunca en lluvias
}
const dunas: ServicioParaHuecos = { id: 'dunas', name: 'Samalayuca', duration_days: null, meses_ideales: [] }

const base = {
  hoy: '2026-09-01',
  alcances: ['nacional', 'frontera'] as const,
  servicios: [creel, huasteca, dunas],
  salidas: [],
}

describe('oportunidades: ventana y alcances', () => {
  it('trae solo lo que cae en el horizonte y ya no lo que pasó', () => {
    const ids = oportunidades(base).map((o) => o.id)
    expect(ids).toContain('independencia:2026')
    expect(ids).toContain('puente-nov:2026')
    expect(ids).toContain('invierno:2026') // empieza el 20 dic, dentro de 120 días
    expect(ids).not.toContain('verano:2026') // terminó el 24 ago
    expect(ids).not.toContain('puente-feb:2027') // fuera del horizonte
  })
  it('una agencia que solo ve nacional no recibe Labor Day ni Thanksgiving', () => {
    const ids = oportunidades({ ...base, alcances: ['nacional'] }).map((o) => o.id)
    expect(ids).not.toContain('labor-day:2026')
    expect(ids).not.toContain('thanksgiving:2026')
    expect(ids).toContain('independencia:2026')
  })
  it('el horizonte es parámetro', () => {
    const ids = oportunidades({ ...base, horizonteDias: 20 }).map((o) => o.id)
    expect(ids).toEqual(['labor-day:2026', 'independencia:2026'])
  })
  it('el invierno del año anterior sigue vivo en enero, con días negativos', () => {
    const [inv] = oportunidades({ ...base, hoy: '2027-01-03', alcances: ['nacional'] })
    expect(inv.id).toBe('invierno:2026')
    expect(inv.diasPara).toBeLessThan(0)
  })
})

describe('oportunidades: cobertura por salida + duración', () => {
  // Puente de noviembre 2026: sábado 14 a lunes 16.
  it('una salida de 3 días el viernes SÍ cubre el puente del lunes', () => {
    const o = oportunidades({
      ...base,
      salidas: [{ service_id: 'creel', departs_on: '2026-11-13' }],
    }).find((x) => x.id === 'puente-nov:2026')!
    expect(o.estado).toBe('cubierta')
    expect(o.cubiertaPor).toEqual(['creel'])
    expect(o.sugeridos).toEqual([])
  })
  it('la misma salida con duración de 1 día NO lo cubre', () => {
    const o = oportunidades({
      ...base,
      servicios: [{ ...creel, duration_days: 1 }],
      salidas: [{ service_id: 'creel', departs_on: '2026-11-13' }],
    }).find((x) => x.id === 'puente-nov:2026')!
    expect(o.estado).toBe('hueco')
  })
  it('sin duración se asume 1 día', () => {
    const o = oportunidades({
      ...base,
      salidas: [{ service_id: 'dunas', departs_on: '2026-09-16' }],
    }).find((x) => x.id === 'independencia:2026')!
    expect(o.estado).toBe('cubierta')
  })
  it('una salida de un servicio desconocido cuenta como de 1 día y aun así cubre si cae dentro', () => {
    const o = oportunidades({
      ...base,
      salidas: [{ service_id: 'otro', departs_on: '2026-11-15' }],
    }).find((x) => x.id === 'puente-nov:2026')!
    expect(o.estado).toBe('cubierta')
  })
})

describe('oportunidades: qué se sugiere y qué se descarta', () => {
  it('un servicio sin septiembre en sus meses ideales no se sugiere para el 16', () => {
    const o = oportunidades(base).find((x) => x.id === 'independencia:2026')!
    expect(o.sugeridos.map((s) => s.id).sort()).toEqual(['creel', 'dunas'])
  })
  it('sí se sugiere cuando la temporada toca uno de sus meses', () => {
    const o = oportunidades(base).find((x) => x.id === 'puente-nov:2026')!
    expect(o.sugeridos.map((s) => s.id)).toContain('huasteca')
  })
  it('una temporada descartada no vuelve a salir como hueco', () => {
    const o = oportunidades({ ...base, descartadas: ['independencia:2026'] }).find(
      (x) => x.id === 'independencia:2026',
    )!
    expect(o.estado).toBe('descartada')
    expect(o.sugeridos).toEqual([])
  })
  it('cubierta gana a descartada', () => {
    const o = oportunidades({
      ...base,
      descartadas: ['independencia:2026'],
      salidas: [{ service_id: 'dunas', departs_on: '2026-09-16' }],
    }).find((x) => x.id === 'independencia:2026')!
    expect(o.estado).toBe('cubierta')
  })
})

describe('paraAvisar y temporadaPorId', () => {
  it('avisa solo el hueco que ya entró a la ventana de 4 semanas', () => {
    const lista = oportunidades(base)
    expect(paraAvisar(lista.find((x) => x.id === 'independencia:2026')!)).toBe(true) // en 15 días
    expect(paraAvisar(lista.find((x) => x.id === 'puente-nov:2026')!)).toBe(false) // en 74 días
    const cubierta = oportunidades({
      ...base,
      salidas: [{ service_id: 'dunas', departs_on: '2026-09-16' }],
    }).find((x) => x.id === 'independencia:2026')!
    expect(paraAvisar(cubierta)).toBe(false)
  })
  it('sobrevive a `lista.filter(paraAvisar)`, que manda el índice como segundo argumento', () => {
    // Con un número suelto como segundo parámetro, el índice 0 se leía como
    // "anticipación 0 días" y el tick real no emitía nada.
    const ids = oportunidades(base).filter(paraAvisar).map((o) => o.id)
    expect(ids).toEqual(['labor-day:2026', 'independencia:2026'])
    expect(oportunidades(base).filter((o) => paraAvisar(o, { anticipacionDias: 3 }))).toEqual([])
  })
  it('resuelve el id de vuelta a su temporada y rechaza basura', () => {
    expect(temporadaPorId('puente-nov:2026')?.fin).toBe('2026-11-16')
    expect(temporadaPorId('no-existe:2026')).toBeNull()
    expect(temporadaPorId("puente-nov:2026'; drop table")).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { etiquetaDia, partirAccion, unirAccion } from './itinerario'

describe('partirAccion / unirAccion', () => {
  it('lee la hora del prefijo y la normaliza a HH:MM', () => {
    expect(partirAccion('7:00 · Abordaje en el Monumento')).toEqual({ hora: '07:00', texto: 'Abordaje en el Monumento' })
    expect(partirAccion('19:30 Noche de fogata')).toEqual({ hora: '19:30', texto: 'Noche de fogata' })
    expect(partirAccion('  Sandboarding ')).toEqual({ hora: '', texto: '  Sandboarding ' })
  })
  it('una "hora" imposible se queda como texto', () => {
    expect(partirAccion('25:00 · algo')).toEqual({ hora: '', texto: '25:00 · algo' })
    expect(partirAccion('10:75 x')).toEqual({ hora: '', texto: '10:75 x' })
  })
  it('unir es el inverso y NO recorta: el espacio que se está tecleando sobrevive', () => {
    expect(unirAccion({ hora: '07:00', texto: 'Salida' })).toBe('07:00 · Salida')
    expect(unirAccion({ hora: '', texto: 'Salida' })).toBe('Salida')
    expect(partirAccion(unirAccion({ hora: '07:00', texto: 'Salida' }))).toEqual({ hora: '07:00', texto: 'Salida' })
    // El bug: al teclear "Abordaje " el espacio final se perdía en cada render.
    expect(partirAccion(unirAccion({ hora: '07:00', texto: 'Abordaje ' }))).toEqual({ hora: '07:00', texto: 'Abordaje ' })
    expect(partirAccion(unirAccion({ hora: '', texto: 'Abordaje ' }))).toEqual({ hora: '', texto: 'Abordaje ' })
  })
})

describe('etiquetaDia', () => {
  it('sin fecha es "Día N"', () => {
    expect(etiquetaDia(0)).toBe('Día 1')
    expect(etiquetaDia(2, null)).toBe('Día 3')
    expect(etiquetaDia(0, 'no-fecha')).toBe('Día 1')
  })
  it('con la fecha de la salida deriva el día de la semana, avanzando por índice', () => {
    // 2026-09-12 es sábado.
    expect(etiquetaDia(0, '2026-09-12')).toBe('Día 1 · sábado, 12 de septiembre')
    expect(etiquetaDia(1, '2026-09-12')).toBe('Día 2 · domingo, 13 de septiembre')
    expect(etiquetaDia(0, '2026-09-12T00:00:00+00:00')).toBe('Día 1 · sábado, 12 de septiembre')
  })
})

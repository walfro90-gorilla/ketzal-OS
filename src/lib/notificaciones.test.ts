import { describe, expect, it } from 'vitest'
import { EVENTOS, eventoDe } from './notificaciones'

describe('eventoDe', () => {
  it('lee el evento cuando lo conoce', () => {
    for (const e of EVENTOS) expect(eventoDe({ evento: e })).toBe(e)
  })

  it('una fila vieja (sin metadata) cae en null, no revienta', () => {
    expect(eventoDe(null)).toBeNull()
    expect(eventoDe(undefined)).toBeNull()
    expect(eventoDe({})).toBeNull()
  })

  it('jsonb puede ser cualquier cosa: escalar, arreglo o forma rara ⇒ null', () => {
    expect(eventoDe('cotizacion')).toBeNull()
    expect(eventoDe(42)).toBeNull()
    expect(eventoDe(['cotizacion'])).toBeNull()
    expect(eventoDe({ evento: { nested: true } })).toBeNull()
    expect(eventoDe({ evento: 123 })).toBeNull()
  })

  it('un evento desconocido (fila escrita por una versión posterior) ⇒ null', () => {
    expect(eventoDe({ evento: 'cancelacion' })).toBeNull()
    // Y no se cuela nada del prototipo.
    expect(eventoDe({ evento: 'toString' })).toBeNull()
    expect(eventoDe({ evento: 'constructor' })).toBeNull()
  })
})

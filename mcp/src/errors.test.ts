import { describe, expect, it } from 'vitest'
import { safeError } from './errors.js'

describe('safeError', () => {
  it('devuelve verbatim el mensaje autoral de un raise (P0001)', () => {
    // Es el contrato de la app: los RPCs escriben esos mensajes para humanos.
    expect(safeError({ code: 'P0001', message: 'No hay cupo en esa salida.' })).toBe(
      'No hay cupo en esa salida.',
    )
  })

  it('no filtra detalle interno de un permiso denegado', () => {
    const msg = safeError({ code: '42501', message: 'permission denied for view bookings_with_balance' })
    expect(msg).not.toContain('bookings_with_balance')
    expect(msg).toContain('permiso')
  })

  it('traduce una violación de constraint sin nombrarla', () => {
    const msg = safeError({ code: '23505', message: 'duplicate key value violates unique constraint "uq_payments_refund_of"' })
    expect(msg).not.toContain('uq_payments_refund_of')
    expect(msg).toContain('restricción')
  })

  it('pide relogin cuando el JWT no sirve', () => {
    expect(safeError({ code: 'PGRST301', message: 'JWT expired' })).toContain('login')
  })

  it('avisa de versión vieja cuando el RPC no existe', () => {
    expect(safeError({ code: 'PGRST202', message: 'not found' })).toContain('ketzal-mcp')
  })

  it('cae al genérico con un código desconocido o sin error', () => {
    expect(safeError({ code: 'XX000', message: 'boom' })).toBe('No se pudo completar la operación.')
    expect(safeError(null)).toBe('No se pudo completar la operación.')
  })

  it('P0001 sin mensaje no se cuela como cadena vacía', () => {
    expect(safeError({ code: 'P0001', message: null })).toBe('No se pudo completar la operación.')
  })
})

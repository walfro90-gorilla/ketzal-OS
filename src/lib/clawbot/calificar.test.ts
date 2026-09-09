import { describe, expect, it } from 'vitest'
import { avisoCalificar, ventanaCalificar } from './calificar'

describe('ventanaCalificar', () => {
  it('revisa ayer y dos días más atrás, nunca hoy (el viaje puede seguir en curso)', () => {
    expect(ventanaCalificar('2026-09-10')).toEqual({ desde: '2026-09-07', hasta: '2026-09-09' })
    expect(ventanaCalificar('2026-01-01')).toEqual({ desde: '2025-12-29', hasta: '2025-12-31' })
  })
})

describe('avisoCalificar', () => {
  it('va al viajero, con el evento y el pedido en metadata, y lleva al detalle', () => {
    const n = avisoCalificar({ id: 'b-1', marketplace_customer_id: 'u-1', service_name: 'Creel y Barrancas' })
    expect(n).toEqual({
      user_id: 'u-1',
      title: '¿Cómo estuvo tu viaje?',
      message: 'Cuéntanos cómo te fue en Creel y Barrancas. Tu reseña le sirve a la agencia y a quien viaja después.',
      metadata: { evento: 'calificar', booking_id: 'b-1' },
      action_url: '/mis-compras/b-1',
    })
  })
})

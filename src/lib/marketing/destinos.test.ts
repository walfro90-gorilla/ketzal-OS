import { describe, expect, it } from 'vitest'
import type { PublicServiceCard } from '@/app/explora/data'
import { agruparPorDestino, slugDestino, tituloDestino } from './destinos'

const base: PublicServiceCard = {
  id: 'x',
  name: 'Tour',
  price: 1000,
  service_type: 'tour',
  service_category: null,
  city_to: 'Creel',
  state_to: 'Chihuahua',
  location: null,
  image: null,
  agency: 'Border Travels',
  city_from: 'Ciudad Juárez',
  state_from: 'Chihuahua',
  next_departure: '2026-10-01',
  departures_count: 2,
}
const svc = (p: Partial<PublicServiceCard>): PublicServiceCard => ({ ...base, ...p })

describe('slugDestino', () => {
  it('quita acentos y espacios', () => {
    expect(slugDestino('Ciudad Valles')).toBe('ciudad-valles')
    expect(slugDestino('Medellín')).toBe('medellin')
    expect(slugDestino('Mazatlán')).toBe('mazatlan')
  })

  it('no deja guiones colgando ni caracteres raros', () => {
    expect(slugDestino('  San José del Cabo!  ')).toBe('san-jose-del-cabo')
  })
})

describe('agruparPorDestino', () => {
  it('junta los viajes del mismo destino y toma el precio más bajo', () => {
    const [d] = agruparPorDestino([
      svc({ id: 'a', price: 2399 }),
      svc({ id: 'b', price: 1800 }),
    ])
    expect(d.servicios).toHaveLength(2)
    expect(d.precioDesde).toBe(1800)
    expect(d.salidasFuturas).toBe(4)
  })

  it('toma la salida MÁS PRÓXIMA del destino, no la del primer viaje', () => {
    const [d] = agruparPorDestino([
      svc({ id: 'a', next_departure: '2026-12-20' }),
      svc({ id: 'b', next_departure: '2026-10-03' }),
    ])
    expect(d.proximaSalida).toBe('2026-10-03')
  })

  it('descarta lo que no tiene ciudad de destino', () => {
    // Una página que no puede nombrar el lugar en el título no sirve.
    expect(agruparPorDestino([svc({ city_to: null }), svc({ city_to: '  ' })])).toHaveLength(0)
  })

  it('ignora precios cero al calcular "desde"', () => {
    const [d] = agruparPorDestino([svc({ id: 'a', price: 0 }), svc({ id: 'b', price: 2399 })])
    expect(d.precioDesde).toBe(2399)
  })

  it('sin ningún precio válido, precioDesde es null (no 0)', () => {
    const [d] = agruparPorDestino([svc({ price: 0 })])
    expect(d.precioDesde).toBeNull()
  })

  it('ordena por salida más próxima y manda al final los que no tienen', () => {
    const ds = agruparPorDestino([
      svc({ id: 'a', city_to: 'Mazatlán', next_departure: null, departures_count: 0 }),
      svc({ id: 'b', city_to: 'Creel', next_departure: '2026-10-03' }),
      svc({ id: 'c', city_to: 'Medellín', next_departure: '2026-09-07' }),
    ])
    expect(ds.map((d) => d.ciudad)).toEqual(['Medellín', 'Creel', 'Mazatlán'])
  })

  it('deduplica orígenes', () => {
    const [d] = agruparPorDestino([svc({ id: 'a' }), svc({ id: 'b' })])
    expect(d.origenes).toEqual(['Ciudad Juárez'])
  })
})

describe('tituloDestino', () => {
  it('nombra el origen cuando todos los viajes salen del mismo lugar', () => {
    const [d] = agruparPorDestino([svc({})])
    expect(tituloDestino(d)).toBe('Viajes a Creel, Chihuahua desde Ciudad Juárez')
  })

  it('con dos orígenes NO dice "desde", porque sería falso', () => {
    const [d] = agruparPorDestino([
      svc({ id: 'a', city_from: 'Ciudad Juárez' }),
      svc({ id: 'b', city_from: 'Chihuahua' }),
    ])
    expect(tituloDestino(d)).toBe('Viajes a Creel, Chihuahua')
  })

  it('sin origen tampoco lo inventa', () => {
    const [d] = agruparPorDestino([svc({ city_from: null })])
    expect(tituloDestino(d)).toBe('Viajes a Creel, Chihuahua')
  })

  it('no repite el lugar cuando ciudad y estado son iguales', () => {
    const [d] = agruparPorDestino([svc({ city_to: 'Chihuahua', state_to: 'Chihuahua' })])
    expect(tituloDestino(d)).toBe('Viajes a Chihuahua desde Ciudad Juárez')
  })
})

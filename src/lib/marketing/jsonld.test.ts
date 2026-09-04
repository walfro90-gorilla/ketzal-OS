import { describe, expect, it } from 'vitest'
import { marcaJsonLd, serializeJsonLd, touristTripJsonLd } from './jsonld'

const BASE = {
  name: 'Creel y Barrancas del Cobre',
  description: 'Tres días por la sierra.',
  price: 5598,
  city_from: 'Ciudad Juárez',
  state_from: 'Chihuahua',
  city_to: 'Creel',
  state_to: 'Chihuahua',
  images: { imgBanner: 'https://cdn.example/foto.jpg' },
  agency: { name: 'Border Travels' },
  url: 'https://ketzal.tours/servicio/abc',
}

describe('touristTripJsonLd', () => {
  it('publica la salida MÁS PRÓXIMA, no la primera de la lista', () => {
    const d = touristTripJsonLd({
      ...BASE,
      departures: [
        { departs_on: '2026-12-20' },
        { departs_on: '2026-10-03' },
        { departs_on: '2026-11-15' },
      ],
    }) as Record<string, unknown>
    expect(d.departureTime).toBe('2026-10-03')
    expect((d.offers as Record<string, unknown>).availabilityStarts).toBe('2026-10-03')
    expect((d.offers as Record<string, unknown>).availability).toBe(
      'https://schema.org/InStock'
    )
  })

  it('sin salidas no inventa fecha y baja la disponibilidad', () => {
    const d = touristTripJsonLd({ ...BASE, departures: [] }) as Record<string, unknown>
    expect(d).not.toHaveProperty('departureTime')
    const offers = d.offers as Record<string, unknown>
    expect(offers).not.toHaveProperty('availabilityStarts')
    expect(offers.availability).toBe('https://schema.org/LimitedAvailability')
  })

  it('sin precio no emite offers (un precio 0 no es una oferta)', () => {
    const d = touristTripJsonLd({
      ...BASE,
      price: 0,
      departures: [{ departs_on: '2026-10-03' }],
    }) as Record<string, unknown>
    expect(d).not.toHaveProperty('offers')
    expect(d.departureTime).toBe('2026-10-03')
  })
})

describe('marcaJsonLd', () => {
  it('ata la organización al sitio por @id', () => {
    const d = marcaJsonLd('https://ketzal.tours', 'https://cdn.example/logo.png')
    const [org, sitio] = d['@graph'] as Record<string, unknown>[]
    expect(org['@type']).toBe('Organization')
    expect(org.logo).toBe('https://cdn.example/logo.png')
    expect(sitio['@type']).toBe('WebSite')
    expect((sitio.publisher as Record<string, unknown>)['@id']).toBe(org['@id'])
  })

  it('sin logo no emite la propiedad vacía', () => {
    const [org] = marcaJsonLd('https://ketzal.tours', null)['@graph'] as Record<
      string,
      unknown
    >[]
    expect(org).not.toHaveProperty('logo')
  })
})

describe('serializeJsonLd', () => {
  it('escapa < para que un valor no pueda cerrar el <script>', () => {
    const salida = serializeJsonLd({ name: '</script><img onerror=alert(1)>' })
    expect(salida).not.toContain('</script>')
    expect(salida).toContain('\\u003c')
  })
})

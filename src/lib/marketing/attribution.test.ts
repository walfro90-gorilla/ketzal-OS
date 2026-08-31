import { describe, expect, it } from 'vitest'
import { parseAttribution, readStoredAttribution } from './attribution'
import { esRutaMedible } from './rutas-medibles'

const NOW = new Date('2026-08-31T12:00:00Z')

describe('parseAttribution', () => {
  it('sin parámetros de campaña no hay atribución (visita directa)', () => {
    expect(parseAttribution('', '/explora', NOW)).toBeNull()
    expect(parseAttribution('?salida=abc', '/servicio/x', NOW)).toBeNull()
  })

  it('mapea utm_* + fbclid + gclid y sella landing/first_touch_at', () => {
    const a = parseAttribution(
      '?utm_source=facebook&utm_medium=cpc&utm_campaign=creel&fbclid=F1',
      '/servicio/abc',
      NOW
    )
    expect(a).toEqual({
      source: 'facebook',
      medium: 'cpc',
      campaign: 'creel',
      fbclid: 'F1',
      landing: '/servicio/abc',
      first_touch_at: NOW.toISOString(),
    })
  })
})

describe('readStoredAttribution', () => {
  const vigente = JSON.stringify({
    source: 'facebook',
    landing: '/',
    first_touch_at: NOW.toISOString(),
    expires_at: '2026-09-30T00:00:00Z',
  })

  it('respeta el TTL: vencida ⇒ null (first-touch de 30 días)', () => {
    expect(readStoredAttribution(vigente, new Date('2026-10-01'))).toBeNull()
  })

  it('vigente ⇒ atribución sin expires_at', () => {
    const a = readStoredAttribution(vigente, NOW)
    expect(a?.source).toBe('facebook')
    expect(a).not.toHaveProperty('expires_at')
  })

  it('basura o malformada ⇒ null, nunca lanza', () => {
    expect(readStoredAttribution('{no json', NOW)).toBeNull()
    expect(readStoredAttribution('{"x":1}', NOW)).toBeNull()
    expect(readStoredAttribution(null, NOW)).toBeNull()
  })
})

describe('esRutaMedible', () => {
  it('marketplace público sí; back-office no', () => {
    for (const p of ['/', '/explora', '/servicio/abc', '/comprar/abc', '/mis-compras'])
      expect(esRutaMedible(p)).toBe(true)
    for (const p of ['/dashboard', '/ventas/abc', '/cobranza', '/login', '/cuentas'])
      expect(esRutaMedible(p)).toBe(false)
  })
})

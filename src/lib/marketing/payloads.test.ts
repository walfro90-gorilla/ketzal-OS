import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import {
  buildMetaPurchase,
  buildMetaInitiateCheckout,
  buildGa4Purchase,
  buildGa4BeginCheckout,
  type ConversionInput,
} from './payloads'

// ADR-0025: el shape exacto importa — Meta rechaza eventos sin customer
// information parameter (error 2804050) y GA4 acepta basura en silencio.

const BOOKING = '3f2c8a1e-0000-4000-8000-000000000001'

const base: ConversionInput = {
  orderId: BOOKING,
  value: 4800,
  currency: 'MXN',
  eventSourceUrl: 'https://ketzal-os.vercel.app/servicio/abc',
}

describe('buildMetaPurchase', () => {
  it('siempre lleva external_id = sha256(orderId) aunque no haya nada más', () => {
    const p = buildMetaPurchase(base)
    const ev = p.data[0]
    expect(ev.event_name).toBe('Purchase')
    expect(ev.event_id).toBe(BOOKING)
    expect(ev.action_source).toBe('website')
    expect(ev.user_data.external_id).toBe(
      createHash('sha256').update(BOOKING).digest('hex')
    )
    expect(ev.custom_data).toEqual({ value: 4800, currency: 'MXN' })
    // Sin datos capturados NO se mandan claves vacías.
    expect(ev.user_data).not.toHaveProperty('client_ip_address')
    expect(ev.user_data).not.toHaveProperty('fbp')
    expect(ev.user_data).not.toHaveProperty('fbc')
    expect(p).not.toHaveProperty('test_event_code')
  })

  it('prefiere la cookie _fbc exacta sobre reconstruir del fbclid', () => {
    const p = buildMetaPurchase({
      ...base,
      fbclid: 'CLICK123',
      fbcCookie: 'fb.1.1700000000000.CLICK123',
    })
    expect(p.data[0].user_data.fbc).toBe('fb.1.1700000000000.CLICK123')
  })

  it('reconstruye fbc del fbclid cuando no hay cookie (pixel bloqueado)', () => {
    const p = buildMetaPurchase({ ...base, fbclid: 'CLICK123' })
    expect(p.data[0].user_data.fbc).toMatch(/^fb\.1\.\d+\.CLICK123$/)
  })

  it('incluye ip/ua/fbp y test_event_code cuando existen', () => {
    const p = buildMetaPurchase({
      ...base,
      clientIp: '187.190.1.2',
      clientUa: 'Mozilla/5.0',
      fbp: 'fb.1.1700000000000.99',
      testEventCode: 'TEST123',
    })
    const ud = p.data[0].user_data
    expect(ud.client_ip_address).toBe('187.190.1.2')
    expect(ud.client_user_agent).toBe('Mozilla/5.0')
    expect(ud.fbp).toBe('fb.1.1700000000000.99')
    expect(p.test_event_code).toBe('TEST123')
  })
})

describe('buildMetaInitiateCheckout', () => {
  it('mismo shape con event_name InitiateCheckout', () => {
    const p = buildMetaInitiateCheckout(base)
    expect(p.data[0].event_name).toBe('InitiateCheckout')
    expect(p.data[0].event_id).toBe(BOOKING)
  })
})

describe('GA4', () => {
  it('purchase: client_id estable y transaction_id = orderId', () => {
    const a = buildGa4Purchase(base)
    const b = buildGa4Purchase(base)
    expect(a.client_id).toBe(b.client_id) // reintentos ⇒ mismo client_id
    expect(a.client_id).toMatch(/^\d+\.\d+$/)
    expect(a.events[0].name).toBe('purchase')
    expect(a.events[0].params).toEqual({
      transaction_id: BOOKING,
      value: 4800,
      currency: 'MXN',
    })
  })

  it('begin_checkout conserva la traza al pedido', () => {
    const p = buildGa4BeginCheckout(base)
    expect(p.events[0].name).toBe('begin_checkout')
    expect(p.events[0].params.transaction_id).toBe(BOOKING)
  })
})

import { describe, it, expect } from 'vitest'
import {
  explicarTarifa,
  linkReferido,
  mensajeBienvenida,
  mensajeParaCompartir,
  waCompartir,
} from './embajador'

describe('explicarTarifa', () => {
  it('traduce cada basis a una frase sin jerga', () => {
    expect(explicarTarifa({ basis: 'percent', rate: 5, unit_amount: null }))
      .toBe('Ganas 5% de cada viaje que vendas.')
    expect(explicarTarifa({ basis: 'fijo_pax', rate: null, unit_amount: 200 }))
      .toBe('Ganas $200 por cada persona que viaje.')
    expect(explicarTarifa({ basis: 'hibrido', rate: 3, unit_amount: 150 }))
      .toBe('Ganas 3% de la venta más $150 por cada persona que viaje.')
  })
  it('null cuando no hay tarifa: el portal debe decirlo, no fingir un 0', () => {
    expect(explicarTarifa(null)).toBeNull()
  })
  it('null si la basis viene incompleta en vez de mostrar una frase rota', () => {
    // hibrido sin unit_amount no debería existir (lo impide el check de la BD),
    // pero si llegara, más vale callar que prometer mal.
    expect(explicarTarifa({ basis: 'hibrido', rate: 3, unit_amount: null })).toBeNull()
    expect(explicarTarifa({ basis: 'percent', rate: null, unit_amount: 10 })).toBeNull()
  })
})

describe('linkReferido', () => {
  it('apunta a la vitrina con el código', () => {
    expect(linkReferido('https://ketzal-os.vercel.app', 'WALFRE'))
      .toBe('https://ketzal-os.vercel.app/explora?ref=WALFRE')
  })
  it('no duplica la diagonal ni rompe códigos con caracteres raros', () => {
    expect(linkReferido('https://x.com/', 'A B')).toBe('https://x.com/explora?ref=A%20B')
  })
})

describe('mensajes', () => {
  it('la bienvenida usa el nombre de pila y trae el link', () => {
    const m = mensajeBienvenida('Ana María Pérez', 'https://x.com/l')
    expect(m).toContain('¡Ana, ya eres embajador')
    expect(m).toContain('https://x.com/l')
    expect(m).toContain('no lo compartas')
  })
  it('aguanta un nombre vacío sin generar un saludo roto', () => {
    expect(mensajeBienvenida('   ', 'https://x.com/l')).toContain('¡Hola, ya eres embajador')
  })
  it('el mensaje para compartir lleva el gancho del mínimo', () => {
    const m = mensajeParaCompartir('https://x.com/e?ref=A')
    expect(m).toContain('mínimo')
    expect(m).toContain('https://x.com/e?ref=A')
  })
  it('waCompartir codifica saltos de línea', () => {
    expect(waCompartir('hola\nmundo')).toBe('https://wa.me/?text=hola%0Amundo')
  })
})

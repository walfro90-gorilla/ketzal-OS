import { describe, it, expect } from 'vitest'
import {
  explicarTarifa,
  linkReferido,
  mensajeBienvenida,
  mensajeParaCompartir,
  waCompartir,
  explicarMiss,
  normalizarCodigoReferido,
  nivelDe,
  NIVELES,
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

describe('normalizarCodigoReferido', () => {
  it('sube a mayúsculas y quita espacios', () => {
    expect(normalizarCodigoReferido('  wal ref  ')).toEqual({ code: 'WALREF' })
  })
  it('vacío significa quitar el código, no error', () => {
    expect(normalizarCodigoReferido('')).toEqual({ code: null })
    expect(normalizarCodigoReferido(null)).toEqual({ code: null })
    expect(normalizarCodigoReferido(undefined)).toEqual({ code: null })
  })
  it('acepta letras, números, guion y guion bajo', () => {
    expect(normalizarCodigoReferido('WAL_2026-B')).toEqual({ code: 'WAL_2026-B' })
  })
  it('rechaza lo que no cabe en una URL ni se dicta por teléfono', () => {
    for (const malo of ['AB', 'a'.repeat(33), 'con.punto', 'ñandú', 'a/b']) {
      expect(normalizarCodigoReferido(malo)).toHaveProperty('error')
    }
  })
})

describe('explicarMiss', () => {
  it('traduce el motivo a algo que el admin puede accionar', () => {
    const m = explicarMiss('sin_tarifa_de_la_agencia')
    expect(m.titulo).toContain('no tiene tarifa')
    expect(m.queHacer).toContain('Configúrala')
    expect(m.accionable).toBe(true)
  })
  it('cubre los motivos accionables que escribe el RPC', () => {
    for (const r of [
      'sin_tarifa_de_la_agencia',
      'codigo_inexistente',
      'tarifa_da_cero',
      'comisiones_exceden_la_venta',
      'perfil_inactivo',
    ]) {
      expect(explicarMiss(r).accionable).toBe(true)
    }
  })
  // m010: el único motivo que NO se arregla. Marcarlo accionable mandaría al
  // admin a buscar una avería donde el motor hizo justo lo que debía.
  it('el auto-referido se explica pero no se acciona', () => {
    const m = explicarMiss('auto_referido')
    expect(m.titulo).toContain('sí mismo')
    expect(m.accionable).toBe(false)
    expect(m.queHacer).toContain('nada que arreglar')
  })
  it('no revienta con un motivo que no conoce', () => {
    const m = explicarMiss('motivo_del_futuro')
    expect(m.titulo).toBe('motivo_del_futuro')
    expect(m.accionable).toBe(false)
  })
})

describe('nivelDe', () => {
  it('empieza en el primer nivel sin haber ganado nada', () => {
    const n = nivelDe(0)
    expect(n.nombre).toBe('Explorador')
    expect(n.numero).toBe(1)
    expect(n.progreso).toBe(0)
  })

  it('sube justo al alcanzar el umbral', () => {
    expect(nivelDe(1_999).nombre).toBe('Explorador')
    expect(nivelDe(2_000).nombre).toBe('Guía')
  })

  it('dice cuánto falta para el siguiente', () => {
    expect(nivelDe(1_500).siguienteEn).toBe(500)
  })

  it('el último nivel no tiene siguiente y va al 100%', () => {
    const n = nivelDe(999_999)
    expect(n.nombre).toBe(NIVELES[NIVELES.length - 1].nombre)
    expect(n.siguienteEn).toBeNull()
    expect(n.progreso).toBe(1)
  })

  it('el progreso avanza dentro del tramo, no del total', () => {
    // Guía va de 2,000 a 10,000: 6,000 es justo la mitad del tramo.
    expect(nivelDe(6_000).progreso).toBeCloseTo(0.5)
  })

  it('un devengado negativo (todo reversado) no rompe ni sube de nivel', () => {
    const n = nivelDe(-500)
    expect(n.numero).toBe(1)
    expect(n.progreso).toBe(0)
  })

  it('NaN se trata como cero', () => {
    expect(nivelDe(Number.NaN).numero).toBe(1)
  })
})

import { describe, expect, it } from 'vitest'
import { MAPA_ALTO, MAPA_ANCHO, MEXICO_PATH, proyectar } from './mapa-mexico'

// El riesgo de una proyección no es que truene, es que ponga los puntos en el
// lugar equivocado sin avisar. Se ancla con ciudades cuya posición relativa
// cualquiera puede verificar mirando un mapa.

describe('MEXICO_PATH', () => {
  it('es un trazo cerrado y pequeño (va inline en el HTML)', () => {
    expect(MEXICO_PATH.startsWith('M')).toBe(true)
    expect(MEXICO_PATH.endsWith('Z')).toBe(true)
    expect(MEXICO_PATH.length).toBeLessThan(6000)
  })
})

describe('proyectar', () => {
  const CIUDADES = {
    juarez: proyectar(31.6904, -106.4245)!,
    creel: proyectar(27.75114, -107.63528)!,
    valles: proyectar(21.98333, -99.01667)!,
    mazatlan: proyectar(23.24944, -106.41139)!,
  }

  it('coloca dentro del lienzo a las cuatro ciudades mexicanas', () => {
    for (const [nombre, p] of Object.entries(CIUDADES)) {
      expect(p, nombre).not.toBeNull()
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThanOrEqual(MAPA_ANCHO)
      expect(p.y).toBeLessThanOrEqual(MAPA_ALTO)
    }
  })

  it('el norte queda arriba: Ciudad Juárez sobre Creel, y Creel sobre Mazatlán', () => {
    expect(CIUDADES.juarez.y).toBeLessThan(CIUDADES.creel.y)
    expect(CIUDADES.creel.y).toBeLessThan(CIUDADES.mazatlan.y)
  })

  it('el este queda a la derecha: Ciudad Valles a la derecha de Creel', () => {
    expect(CIUDADES.valles.x).toBeGreaterThan(CIUDADES.creel.x)
  })

  it('devuelve null fuera del lienzo, en vez de forzar el punto adentro', () => {
    expect(proyectar(6.2442, -75.582)).toBeNull() // Medellín, Colombia
    expect(proyectar(40.7128, -74.006)).toBeNull() // Nueva York
    expect(proyectar(-33.4489, -70.6693)).toBeNull() // Santiago de Chile
  })

  it('no revienta con valores imposibles', () => {
    expect(proyectar(Number.NaN, -100)).toBeNull()
    expect(proyectar(20, Number.POSITIVE_INFINITY)).toBeNull()
  })
})

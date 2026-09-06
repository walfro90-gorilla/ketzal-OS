import { describe, expect, it } from 'vitest'
import {
  claveLugar,
  esMexico,
  estadoCanonico,
  ESTADOS_MX,
  etiquetaLugar,
  paisCanonico,
} from './mexico'

describe('ESTADOS_MX', () => {
  it('trae las 32 entidades, sin repetidos', () => {
    expect(ESTADOS_MX).toHaveLength(32)
    expect(new Set(ESTADOS_MX.map(claveLugar)).size).toBe(32)
  })
})

describe('claveLugar', () => {
  it('agrupa lo que la gente escribe distinto', () => {
    // El caso real: si dos personas capturan el mismo lugar con acento y sin él,
    // tienen que caer en el mismo grupo o el reporte sale partido.
    expect(claveLugar('Mazatlán')).toBe(claveLugar('MAZATLAN'))
    expect(claveLugar('San Luis Potosí')).toBe(claveLugar('  san luis potosi  '))
    expect(claveLugar('Nuevo León')).toBe('nuevo-leon')
  })

  it('vacío o nulo dan cadena vacía, no "undefined"', () => {
    expect(claveLugar(null)).toBe('')
    expect(claveLugar(undefined)).toBe('')
    expect(claveLugar('   ')).toBe('')
  })
})

describe('estadoCanonico', () => {
  it('reconoce el estado aunque venga mal escrito de mayúsculas o acentos', () => {
    expect(estadoCanonico('CHIHUAHUA')).toBe('Chihuahua')
    expect(estadoCanonico('queretaro')).toBe('Querétaro')
  })

  it('un PAÍS no es un estado — el bug que motivó todo esto', () => {
    expect(estadoCanonico('Colombia')).toBeNull()
    expect(estadoCanonico('Brasil')).toBeNull()
    expect(estadoCanonico('Costa Rica')).toBeNull()
  })
})

describe('paisCanonico', () => {
  it('normaliza el país', () => {
    expect(paisCanonico('mexico')).toBe('México')
    expect(paisCanonico('COLOMBIA')).toBe('Colombia')
  })

  it('un estado no es país', () => {
    expect(paisCanonico('Sinaloa')).toBeNull()
  })
})

describe('esMexico', () => {
  it('tolera cómo se teclee', () => {
    expect(esMexico('México')).toBe(true)
    expect(esMexico('mexico')).toBe(true)
    expect(esMexico('Colombia')).toBe(false)
    expect(esMexico(null)).toBe(false)
  })
})

describe('etiquetaLugar', () => {
  it('en México manda el estado', () => {
    expect(etiquetaLugar('Creel', 'Chihuahua', 'México')).toBe('Creel, Chihuahua')
  })

  it('fuera de México manda el país, no el estado', () => {
    // "Medellín, Antioquia" no le dice nada a nadie; "Medellín, Colombia" sí.
    expect(etiquetaLugar('Medellín', 'Antioquia', 'Colombia')).toBe('Medellín, Colombia')
  })

  it('no repite cuando ciudad y estado son el mismo nombre', () => {
    expect(etiquetaLugar('Chihuahua', 'Chihuahua', 'México')).toBe('Chihuahua')
  })

  it('aguanta datos incompletos sin inventar', () => {
    expect(etiquetaLugar('Creel', null, null)).toBe('Creel')
    expect(etiquetaLugar(null, 'Chihuahua', 'México')).toBe('Chihuahua')
    expect(etiquetaLugar(null, null, null)).toBe('')
  })
})

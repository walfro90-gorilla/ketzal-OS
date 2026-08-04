import { describe, expect, it } from 'vitest'
import { filasAsientos, type TransportType } from './seats'

const cuentaAsientos = (filas: (number | null)[][]) =>
  filas.flat().filter((x) => x != null).length

describe('filasAsientos', () => {
  it('autobús 2+2: filas de 4 con pasillo al centro', () => {
    const filas = filasAsientos('autobus', 8)
    expect(filas).toEqual([
      [1, 2, null, 3, 4],
      [5, 6, null, 7, 8],
    ])
  })

  it('sprinter 1+2: pasillo tras el primer asiento', () => {
    expect(filasAsientos('sprinter', 6)).toEqual([
      [1, null, 2, 3],
      [4, null, 5, 6],
    ])
  })

  it('avión 3+3', () => {
    expect(filasAsientos('avion', 6)).toEqual([[1, 2, 3, null, 4, 5, 6]])
  })

  it('última fila parcial cuando el total no es múltiplo', () => {
    const filas = filasAsientos('autobus', 6)
    expect(filas[1]).toEqual([5, 6, null])
    expect(cuentaAsientos(filas)).toBe(6)
  })

  it('numera 1..total sin huecos ni repetidos, para todo tipo', () => {
    for (const tipo of ['autobus', 'sprinter', 'van', 'avion'] as TransportType[]) {
      for (const total of [1, 5, 19, 45]) {
        const nums = filasAsientos(tipo, total)
          .flat()
          .filter((x): x is number => x != null)
        expect(nums).toEqual(Array.from({ length: total }, (_, i) => i + 1))
      }
    }
  })

  it('total inválido ⇒ vacío', () => {
    expect(filasAsientos('autobus', 0)).toEqual([])
    expect(filasAsientos('autobus', -3)).toEqual([])
    expect(filasAsientos('autobus', 2.5)).toEqual([])
  })
})

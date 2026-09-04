import { describe, expect, it } from 'vitest'
import { debeCelebrar } from './celebracion-arranque'

describe('debeCelebrar', () => {
  it('celebra la transición: había pendientes y ya no', () => {
    expect(debeCelebrar(1, 0)).toBe(true)
    expect(debeCelebrar(8, 0)).toBe(true)
  })

  it('NO celebra a quien llega a una agencia ya lista', () => {
    // Primera vez que este navegador ve el Panel: no hay transición que probar.
    expect(debeCelebrar(null, 0)).toBe(false)
  })

  it('NO celebra dos veces: la segunda visita ya venía en cero', () => {
    expect(debeCelebrar(0, 0)).toBe(false)
  })

  it('NO celebra mientras siga faltando algo', () => {
    expect(debeCelebrar(3, 2)).toBe(false)
    expect(debeCelebrar(null, 5)).toBe(false)
    expect(debeCelebrar(0, 1)).toBe(false) // un paso se deshizo (borró su servicio)
  })

  it('un paso que se deshace y se vuelve a hacer SÍ celebra otra vez', () => {
    // Es correcto: volvió a quedar lista. Y es el mismo criterio derivado que
    // usa el checklist, que también reaparece si borras tu único servicio.
    expect(debeCelebrar(1, 0)).toBe(true)
  })
})

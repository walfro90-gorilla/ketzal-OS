import { beforeEach, describe, expect, it } from 'vitest'
import { MAX_WRITES } from './config.js'
import { assertMontoEsperado, requireConfirm, resetWrites, spendWrite, writesLeft } from './guard.js'

beforeEach(resetWrites)

describe('requireConfirm', () => {
  it('exige el booleano true, no un equivalente laxo', () => {
    expect(() => requireConfirm(true)).not.toThrow()
    for (const laxo of [undefined, null, false, 'true', 1, {}]) {
      expect(() => requireConfirm(laxo)).toThrow(/confirmar/)
    }
  })
})

describe('tope de escrituras', () => {
  it('deja pasar hasta el tope y luego frena', () => {
    for (let i = 0; i < MAX_WRITES; i++) spendWrite()
    expect(writesLeft()).toBe(0)
    expect(() => spendWrite()).toThrow(/Tope de/)
  })

  it('el contador refleja lo gastado', () => {
    spendWrite()
    spendWrite()
    expect(writesLeft()).toBe(MAX_WRITES - 2)
  })
})

describe('assertMontoEsperado', () => {
  it('tolera el centavo de redondeo', () => {
    expect(() => assertMontoEsperado(1500, 1500.004)).not.toThrow()
  })

  it('frena un preview desfasado', () => {
    // La pena sube por tramos de fecha: un preview de ayer puede estar en otro tramo.
    expect(() => assertMontoEsperado(1500, 3000)).toThrow(/3000\.00/)
  })

  it('frena un esperado no numérico en vez de dejarlo pasar', () => {
    expect(() => assertMontoEsperado(Number.NaN, 1500)).toThrow()
  })
})

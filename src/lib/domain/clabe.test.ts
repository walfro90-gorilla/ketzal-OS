import { describe, expect, it } from 'vitest'
import { normalizarClabe, validarClabe, validarTarjeta } from './clabe'

describe('validarClabe', () => {
  it('acepta CLABEs válidas (dígito de control correcto)', () => {
    expect(validarClabe('646180157000000004')).toBe(true) // STP
    expect(validarClabe('002010077777777771')).toBe(true) // Banamex
  })

  it('rechaza dígito de control incorrecto', () => {
    expect(validarClabe('646180157000000005')).toBe(false)
    expect(validarClabe('002010077777777770')).toBe(false)
  })

  it('rechaza longitud incorrecta', () => {
    expect(validarClabe('64618015700000000')).toBe(false) // 17
    expect(validarClabe('6461801570000000041')).toBe(false) // 19
    expect(validarClabe('')).toBe(false)
  })

  it('rechaza caracteres no numéricos', () => {
    expect(validarClabe('64618015700000000X')).toBe(false)
    expect(validarClabe('646180 15700000004')).toBe(false)
  })
})

describe('validarTarjeta', () => {
  it('acepta tarjetas válidas (Luhn)', () => {
    expect(validarTarjeta('4111111111111111')).toBe(true) // Visa test clásica
    expect(validarTarjeta('5555555555554444')).toBe(true) // Mastercard test
  })

  it('rechaza Luhn incorrecto', () => {
    expect(validarTarjeta('4111111111111112')).toBe(false)
  })

  it('rechaza longitud/caracteres incorrectos', () => {
    expect(validarTarjeta('411111111111111')).toBe(false) // 15
    expect(validarTarjeta('41111111111111112')).toBe(false) // 17
    expect(validarTarjeta('4111 1111 1111 1111')).toBe(false) // espacios
    expect(validarTarjeta('')).toBe(false)
  })

  it('normalizada + validada funcionan juntas', () => {
    expect(validarTarjeta(normalizarClabe('4111 1111 1111 1111'))).toBe(true)
  })
})

describe('normalizarClabe', () => {
  it('quita espacios y guiones', () => {
    expect(normalizarClabe('6461 8015 7000 0000 04')).toBe('646180157000000004')
    expect(normalizarClabe('646-180-157-000-000-004')).toBe('646180157000000004')
  })

  it('normalizada + validada funcionan juntas', () => {
    expect(validarClabe(normalizarClabe('6461 8015 7000 0000 04'))).toBe(true)
  })
})

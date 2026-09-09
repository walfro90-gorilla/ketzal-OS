import { describe, expect, it } from 'vitest'
import { agregarEtiquetas, partirEtiquetas } from './etiquetas'

describe('partirEtiquetas', () => {
  it('parte por coma y por salto de línea, recorta y tira vacíos', () => {
    expect(partirEtiquetas(' Transporte redondo, desayuno \n\nGuía,,')).toEqual(['Transporte redondo', 'desayuno', 'Guía'])
    expect(partirEtiquetas('')).toEqual([])
    expect(partirEtiquetas(' , \n ')).toEqual([])
  })
})

describe('agregarEtiquetas', () => {
  it('agrega al final sin repetir, ignorando mayúsculas y acentos', () => {
    expect(agregarEtiquetas(['Desayuno'], 'desayuno, Guía, guia, Propinas')).toEqual(['Desayuno', 'Guía', 'Propinas'])
  })
  it('no muta la lista original', () => {
    const base = ['a']
    agregarEtiquetas(base, 'b')
    expect(base).toEqual(['a'])
  })
})

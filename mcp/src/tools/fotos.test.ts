import { describe, expect, it } from 'vitest'
import { KetzalError } from '../errors.js'
import { extDe, mergeImages } from './fotos.js'

describe('extDe', () => {
  it('mapea jpg/jpeg/png/webp y normaliza jpeg a jpg', () => {
    expect(extDe('/tmp/foto.jpg')).toEqual({ ext: 'jpg', mime: 'image/jpeg' })
    expect(extDe('/tmp/FOTO.JPEG')).toEqual({ ext: 'jpg', mime: 'image/jpeg' })
    expect(extDe('a.png')).toEqual({ ext: 'png', mime: 'image/png' })
    expect(extDe('a.webp')).toEqual({ ext: 'webp', mime: 'image/webp' })
  })

  it('rechaza formatos que la app no acepta', () => {
    expect(() => extDe('/tmp/flyer.pdf')).toThrow(KetzalError)
    expect(() => extDe('/tmp/sin-extension')).toThrow(KetzalError)
    expect(() => extDe('a.gif')).toThrow(KetzalError)
  })
})

describe('mergeImages', () => {
  it('banner reemplaza sin tocar la galería ni otras claves', () => {
    const actual = { imgBanner: 'viejo', imgAlbum: ['a'], video: 'x' }
    const { next } = mergeImages(actual, { banner: 'nuevo' })
    expect(next).toEqual({ imgBanner: 'nuevo', imgAlbum: ['a'], video: 'x' })
  })

  it('la galería agrega con dedupe sobre lo existente', () => {
    const { next } = mergeImages({ imgAlbum: ['a', 'b'] }, { albumNuevas: ['b', 'c'] })
    expect(next.imgAlbum).toEqual(['a', 'b', 'c'])
  })

  it('respeta el tope de 20 y reporta las que no cupieron', () => {
    const llenas = Array.from({ length: 19 }, (_, i) => `u${i}`)
    const { next, sinCupo } = mergeImages({ imgAlbum: llenas }, { albumNuevas: ['x', 'y', 'z'] })
    expect((next.imgAlbum as string[]).length).toBe(20)
    expect(sinCupo).toBe(2)
  })

  it('jsonb nulo o corrupto arranca de cero', () => {
    expect(mergeImages(null, { banner: 'b' }).next).toEqual({ imgBanner: 'b' })
    expect(mergeImages(['array'], { albumNuevas: ['a'] }).next).toEqual({ imgAlbum: ['a'] })
  })
})

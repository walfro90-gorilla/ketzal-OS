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

  it('quitar desliga de la galería sin tocar el resto', () => {
    const { next, quitadas } = mergeImages(
      { imgBanner: 'b', imgAlbum: ['a', 'mala', 'c'], video: 'x' },
      { quitar: ['mala'] },
    )
    expect(next.imgAlbum).toEqual(['a', 'c'])
    expect(next.imgBanner).toBe('b')
    expect(next.video).toBe('x')
    expect(quitadas).toBe(1)
  })

  it('quitar también puede vaciar el banner', () => {
    const { next, quitadas } = mergeImages({ imgBanner: 'feo', imgAlbum: [] }, { quitar: ['feo'] })
    expect(next.imgBanner).toBeNull()
    expect(quitadas).toBe(1)
  })

  it('quita ANTES de agregar: liberar y llenar en la misma llamada cabe', () => {
    const llenas = Array.from({ length: 20 }, (_, i) => `u${i}`)
    const { next, sinCupo } = mergeImages(
      { imgAlbum: llenas },
      { quitar: ['u0', 'u1'], albumNuevas: ['nueva1', 'nueva2'] },
    )
    expect((next.imgAlbum as string[]).length).toBe(20)
    expect(next.imgAlbum).toContain('nueva1')
    expect(next.imgAlbum).not.toContain('u0')
    expect(sinCupo).toBe(0)
  })

  it('quitar algo que no está no rompe ni miente', () => {
    const { next, quitadas } = mergeImages({ imgAlbum: ['a'] }, { quitar: ['no-existe'] })
    expect(next.imgAlbum).toEqual(['a'])
    expect(quitadas).toBe(0)
  })

  it('jsonb nulo o corrupto arranca de cero', () => {
    expect(mergeImages(null, { banner: 'b' }).next).toEqual({ imgBanner: 'b' })
    expect(mergeImages(['array'], { albumNuevas: ['a'] }).next).toEqual({ imgAlbum: ['a'] })
  })
})

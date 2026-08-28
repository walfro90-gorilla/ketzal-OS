import { describe, expect, it } from 'vitest'
import { videoEmbedUrl } from './video.js'

describe('videoEmbedUrl', () => {
  it('acepta las 4 formas de YouTube y siempre sale por nocookie', () => {
    const embed = 'https://www.youtube-nocookie.com/embed/jwexh94ErUU'
    expect(videoEmbedUrl('https://www.youtube.com/watch?v=jwexh94ErUU')).toBe(embed)
    expect(videoEmbedUrl('https://youtu.be/jwexh94ErUU')).toBe(embed)
    expect(videoEmbedUrl('https://www.youtube.com/embed/jwexh94ErUU')).toBe(embed)
    expect(videoEmbedUrl('https://www.youtube.com/shorts/jwexh94ErUU')).toBe(embed)
  })

  it('acepta Vimeo por id numérico', () => {
    expect(videoEmbedUrl('https://vimeo.com/123456789')).toBe(
      'https://player.vimeo.com/video/123456789',
    )
  })

  it('rechaza lo que la ficha no podría pintar', () => {
    expect(videoEmbedUrl(null)).toBeNull()
    expect(videoEmbedUrl('')).toBeNull()
    expect(videoEmbedUrl('no soy una url')).toBeNull()
    expect(videoEmbedUrl('https://tiktok.com/@x/video/123')).toBeNull()
    expect(videoEmbedUrl('https://www.youtube.com/watch?v=corto')).toBeNull() // id != 11
    expect(videoEmbedUrl('javascript:alert(1)')).toBeNull() // sin http(s)
  })
})

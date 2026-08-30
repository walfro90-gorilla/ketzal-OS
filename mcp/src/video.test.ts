import { afterEach, describe, expect, it } from 'vitest'
import { verificarVideo, videoEmbedUrl } from './video.js'

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

// `videoEmbedUrl` valida la FORMA: once caracteres cualquiera pasan aunque nadie
// haya subido ese video. Sin este chequeo, un id inventado por un LLM termina de
// reproductor muerto en una ficha pública.
describe('verificarVideo', () => {
  const real = globalThis.fetch
  afterEach(() => { globalThis.fetch = real })

  const stub = (r: Partial<Response> | Error) => {
    globalThis.fetch = (async () => {
      if (r instanceof Error) throw r
      return r as Response
    }) as typeof fetch
  }

  it('devuelve título y canal cuando el video existe', async () => {
    stub({ ok: true, status: 200, json: async () => ({ title: 'Colombia', author_name: 'marcacolombia' }) })
    expect(await verificarVideo('https://www.youtube-nocookie.com/embed/NZnXKKTNpnI')).toEqual({
      titulo: 'Colombia',
      canal: 'marcacolombia',
    })
  })

  // Salió de probar en vivo: YouTube contesta 400, no 404, para un id inexistente.
  // Con sólo 404 el id inventado pasaba derecho y el fix no servía de nada.
  it.each([400, 404])('truena si el proveedor dice que no existe (%i)', async (status) => {
    stub({ ok: false, status })
    await expect(verificarVideo('https://www.youtube-nocookie.com/embed/aaaaaaaaaaa')).rejects.toThrow(
      /no existe/,
    )
  })

  it('falla-abierto ante 403: Vimeo lo usa para "no se puede incrustar aquí", no para "no existe"', async () => {
    stub({ ok: false, status: 403 })
    expect(await verificarVideo('https://player.vimeo.com/video/123456')).toBeNull()
  })

  it('falla-ABIERTO si la red se cae: no bloquea una edición legítima', async () => {
    stub(new Error('network down'))
    expect(await verificarVideo('https://www.youtube-nocookie.com/embed/NZnXKKTNpnI')).toBeNull()
  })

  it('falla-abierto ante un 429: un rate limit no dice nada del video', async () => {
    stub({ ok: false, status: 429 })
    expect(await verificarVideo('https://www.youtube-nocookie.com/embed/NZnXKKTNpnI')).toBeNull()
  })

  it('arma la liga canónica de Vimeo, no la de embed', async () => {
    let pedida = ''
    globalThis.fetch = (async (u: string) => {
      pedida = u
      return { ok: true, status: 200, json: async () => ({ title: 't', author_name: 'c' }) } as Response
    }) as unknown as typeof fetch
    await verificarVideo('https://player.vimeo.com/video/123456')
    expect(pedida).toContain('vimeo.com%2F123456')
  })
})

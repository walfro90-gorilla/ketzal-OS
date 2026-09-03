import { afterEach, describe, expect, it } from 'vitest'
import { SITE_URL, origenPublico } from './site-url'

// ADR-0040: todo link que va a un cliente sale del dominio público, no del host
// donde está parado quien lo genera. La env se lee al llamar, así que el test
// la prende y apaga por caso.
const ORIGINAL = process.env.NEXT_PUBLIC_SITE_URL

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_SITE_URL
  else process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL
})

describe('origenPublico', () => {
  it('prefiere NEXT_PUBLIC_SITE_URL aunque el navegador esté en otro host', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://ketzal.tours'
    expect(origenPublico('https://os.ketzal.tours')).toBe('https://ketzal.tours')
    expect(origenPublico('http://localhost:3115')).toBe('https://ketzal.tours')
  })

  it('sin la env cae al origen actual (local/preview, el puerto varía)', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL
    expect(origenPublico('http://localhost:3115')).toBe('http://localhost:3115')
  })

  it('sin env ni origen usa SITE_URL; una cadena vacía no cuenta como origen', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL
    expect(origenPublico(null)).toBe(SITE_URL)
    expect(origenPublico('')).toBe(SITE_URL)
  })
})

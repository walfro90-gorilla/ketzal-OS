import { describe, expect, it } from 'vitest'
import {
  banderaEmoji,
  componerTelefono,
  ladaDe,
  linkWhatsapp,
  PAISES,
  partirTelefono,
} from './phone'

describe('banderaEmoji', () => {
  it('arma la bandera desde el ISO', () => {
    expect(banderaEmoji('MX')).toBe('🇲🇽')
    expect(banderaEmoji('us')).toBe('🇺🇸')
  })
})

describe('partirTelefono', () => {
  it('separa lada y número', () => {
    expect(partirTelefono('+52 656 123 4567')).toEqual({
      iso: 'MX',
      local: '656 123 4567',
    })
  })

  it('la lada MÁS LARGA gana: +1 no se come un +591 ni un +502', () => {
    // Con 3 países en la lista esto no podía fallar; con 27 sí.
    expect(partirTelefono('+591 70012345').iso).toBe('BO')
    expect(partirTelefono('+502 55512345').iso).toBe('GT')
    expect(partirTelefono('+1 9155550100').iso).toBe('US')
  })

  it('sin lada conocida devuelve el valor íntegro y no inventa país', () => {
    // Son los teléfonos guardados antes de que existiera el selector.
    expect(partirTelefono('6561234567')).toEqual({ iso: null, local: '6561234567' })
  })
})

describe('componerTelefono', () => {
  it('pega la lada al número', () => {
    expect(componerTelefono('MX', '656 123 4567')).toBe('+52 656 123 4567')
    expect(componerTelefono('ES', '600 000 000')).toBe('+34 600 000 000')
  })

  it('vacío queda vacío: la lada sola no es un dato', () => {
    expect(componerTelefono('MX', '   ')).toBe('')
  })

  it('ida y vuelta conserva el número en toda la lista', () => {
    for (const pais of PAISES) {
      const guardado = componerTelefono(pais.iso, '5550100')
      expect(partirTelefono(guardado).local).toBe('5550100')
    }
  })

  it('un país desconocido cae en México en vez de romper', () => {
    expect(ladaDe('ZZ')).toBe('+52')
  })
})

describe('catálogo de países', () => {
  it('no tiene ISO repetidos y todas las ladas son dígitos', () => {
    const isos = PAISES.map((p) => p.iso)
    expect(new Set(isos).size).toBe(isos.length)
    expect(PAISES.every((p) => /^\d{1,4}$/.test(p.lada))).toBe(true)
  })

  it('México va primero: es el default del negocio', () => {
    expect(PAISES[0]!.iso).toBe('MX')
  })
})

describe('linkWhatsapp', () => {
  it('agrega lada 52 a los 10 dígitos', () => {
    expect(linkWhatsapp('656 111 2233')).toBe('https://wa.me/526561112233')
  })
  it('respeta el número que ya trae lada', () => {
    expect(linkWhatsapp('+52 656 111 2233')).toBe('https://wa.me/526561112233')
  })
  it('null para correo o número incompleto', () => {
    expect(linkWhatsapp('alguien@correo.com')).toBeNull()
    expect(linkWhatsapp('12345')).toBeNull()
    expect(linkWhatsapp(null)).toBeNull()
  })
})

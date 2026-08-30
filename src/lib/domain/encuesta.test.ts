import { describe, it, expect } from 'vitest'
import {
  filtrarUtm,
  primerDiaDelMes,
  mesEnRango,
  mesesDelRango,
  etiquetaMes,
  normalizarOpciones,
  linkWhatsapp,
  campoCsv,
} from './encuesta'

describe('filtrarUtm', () => {
  it('copia solo las llaves conocidas', () => {
    expect(filtrarUtm({ utm_source: 'meta', pwned: 'x', fbclid: 'abc' })).toEqual({
      utm_source: 'meta',
      fbclid: 'abc',
    })
  })
  it('recorta valores largos para no reventar el tope de meta', () => {
    const largo = 'a'.repeat(500)
    expect(filtrarUtm({ utm_campaign: largo }).utm_campaign).toHaveLength(200)
  })
  it('toma el primer valor cuando el parámetro viene repetido', () => {
    expect(filtrarUtm({ utm_source: ['meta', 'google'] })).toEqual({ utm_source: 'meta' })
  })
  it('ignora vacíos y no-strings', () => {
    expect(filtrarUtm({ utm_source: '  ', utm_medium: undefined })).toEqual({})
  })
})

describe('primerDiaDelMes', () => {
  it('normaliza YYYY-MM y YYYY-MM-DD', () => {
    expect(primerDiaDelMes('2026-11')).toBe('2026-11-01')
    expect(primerDiaDelMes('2026-11-27')).toBe('2026-11-01')
  })
  it('rechaza basura y meses imposibles', () => {
    expect(primerDiaDelMes('nov-2026')).toBeNull()
    expect(primerDiaDelMes('2026-13')).toBeNull()
  })
})

describe('mesEnRango', () => {
  const desde = '2026-10-01'
  const hasta = '2027-03-01'
  it('acepta los extremos', () => {
    expect(mesEnRango('2026-10', desde, hasta)).toBe(true)
    expect(mesEnRango('2027-03', desde, hasta)).toBe(true)
  })
  it('rechaza fuera de rango por ambos lados', () => {
    expect(mesEnRango('2026-09', desde, hasta)).toBe(false)
    expect(mesEnRango('2027-04', desde, hasta)).toBe(false)
  })
  it('compara por año, no solo por mes', () => {
    expect(mesEnRango('2025-11', desde, hasta)).toBe(false)
  })
})

describe('mesesDelRango', () => {
  it('enumera cruzando el fin de año', () => {
    expect(mesesDelRango('2026-11-01', '2027-02-01')).toEqual([
      '2026-11', '2026-12', '2027-01', '2027-02',
    ])
  })
  it('un solo mes cuando desde = hasta', () => {
    expect(mesesDelRango('2026-11-01', '2026-11-01')).toEqual(['2026-11'])
  })
  it('vacío si el rango va al revés', () => {
    expect(mesesDelRango('2027-01-01', '2026-01-01')).toEqual([])
  })
  it('topa en 24 meses', () => {
    expect(mesesDelRango('2026-01-01', '2040-01-01')).toHaveLength(24)
  })
})

describe('etiquetaMes', () => {
  it('formatea sin correrse por zona horaria', () => {
    expect(etiquetaMes('2026-01')).toBe('enero 2026')
    expect(etiquetaMes('2026-12')).toBe('diciembre 2026')
  })
})

describe('normalizarOpciones', () => {
  it('recorta, descarta vacías y numera desde 1', () => {
    expect(normalizarOpciones([' Mazatlán ', '', '  ', 'Creel'])).toEqual([
      { id: 1, label: 'Mazatlán' },
      { id: 2, label: 'Creel' },
    ])
  })
  it('topa en 8 opciones', () => {
    expect(normalizarOpciones(Array.from({ length: 12 }, (_, i) => `D${i}`))).toHaveLength(8)
  })
})

describe('campoCsv', () => {
  it('neutraliza fórmulas: el texto lo escribe cualquiera desde el anuncio', () => {
    // Sin la comilla, Excel ejecuta esto al abrir el CSV de leads.
    expect(campoCsv('=HYPERLINK("http://evil","click")')).toBe(
      '"\'=HYPERLINK(""http://evil"",""click"")"',
    )
    for (const c of ['+', '-', '@', '\t', '\r']) {
      expect(campoCsv(`${c}cmd`)).toBe(`"'${c}cmd"`)
    }
  })
  it('deja el texto normal intacto y solo dobla comillas', () => {
    expect(campoCsv('Mazatlán')).toBe('"Mazatlán"')
    expect(campoCsv('dijo "hola"')).toBe('"dijo ""hola"""')
    // Un signo en medio no es fórmula: no se toca.
    expect(campoCsv('a+b')).toBe('"a+b"')
  })
  it('null y undefined salen como campo vacío', () => {
    expect(campoCsv(null)).toBe('""')
    expect(campoCsv(undefined)).toBe('""')
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

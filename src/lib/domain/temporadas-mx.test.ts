import { describe, expect, it } from 'vitest'
import { pascua, sumarDias, diasEntre, temporadas } from './temporadas-mx'

const por = (anio: number, clave: string) => {
  const t = temporadas(anio).find((x) => x.clave === clave)
  if (!t) throw new Error(`falta ${clave} en ${anio}`)
  return t
}

describe('pascua', () => {
  it('coincide con el calendario para años conocidos', () => {
    expect(pascua(2026)).toBe('2026-04-05')
    expect(pascua(2027)).toBe('2027-03-28')
    expect(pascua(2028)).toBe('2028-04-16')
  })
})

describe('aritmética de fechas sin zona horaria', () => {
  it('suma y resta cruzando mes y año', () => {
    expect(sumarDias('2026-12-30', 3)).toBe('2027-01-02')
    expect(sumarDias('2026-03-01', -1)).toBe('2026-02-28')
    expect(diasEntre('2026-09-01', '2026-09-16')).toBe(15)
    expect(diasEntre('2026-09-16', '2026-09-01')).toBe(-15)
  })
})

describe('puentes de la LFT (art. 74)', () => {
  it('5 de febrero → primer lunes de febrero, fin de semana largo', () => {
    // 2026-02-01 es domingo ⇒ el lunes es el 2.
    expect(por(2026, 'puente-feb')).toMatchObject({ inicio: '2026-01-31', fin: '2026-02-02' })
  })
  it('21 de marzo → tercer lunes de marzo', () => {
    expect(por(2026, 'puente-mar').fin).toBe('2026-03-16')
    expect(por(2027, 'puente-mar').fin).toBe('2027-03-15')
  })
  it('20 de noviembre → tercer lunes de noviembre', () => {
    expect(por(2026, 'puente-nov').fin).toBe('2026-11-16')
  })
  it('el 16 de septiembre NO se mueve', () => {
    for (const a of [2026, 2027, 2028]) {
      expect(por(a, 'independencia')).toMatchObject({ inicio: `${a}-09-16`, fin: `${a}-09-16` })
    }
  })
})

describe('Semana Santa y frontera', () => {
  it('Semana Santa son las dos semanas alrededor de Pascua', () => {
    expect(por(2026, 'semana-santa')).toMatchObject({ inicio: '2026-03-29', fin: '2026-04-12' })
  })
  it('Thanksgiving es el cuarto jueves de noviembre, hasta el domingo', () => {
    expect(por(2026, 'thanksgiving')).toMatchObject({ inicio: '2026-11-26', fin: '2026-11-29' })
  })
  it('Labor Day primer lunes de septiembre; Memorial Day último lunes de mayo', () => {
    expect(por(2026, 'labor-day').fin).toBe('2026-09-07')
    expect(por(2026, 'memorial-day').fin).toBe('2026-05-25')
    expect(por(2027, 'memorial-day').fin).toBe('2027-05-31')
  })
  it('las filas de frontera llevan su alcance; las nacionales el suyo', () => {
    const t = temporadas(2026)
    expect(t.filter((x) => x.alcance === 'frontera').map((x) => x.clave).sort()).toEqual(
      ['july-4', 'labor-day', 'memorial-day', 'spring-break', 'thanksgiving'],
    )
    expect(t.filter((x) => x.alcance === 'nacional')).toHaveLength(12)
  })
})

describe('forma del catálogo', () => {
  it('cada fila es válida y viene ordenada por inicio', () => {
    for (const anio of [2026, 2027, 2030]) {
      const t = temporadas(anio)
      let previa = ''
      for (const fila of t) {
        expect(fila.inicio).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(fila.fin).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(fila.inicio <= fila.fin).toBe(true)
        expect(fila.inicio >= previa).toBe(true)
        expect(fila.porque.length).toBeGreaterThan(20)
        previa = fila.inicio
      }
      expect(new Set(t.map((x) => x.clave)).size).toBe(t.length)
    }
  })
})

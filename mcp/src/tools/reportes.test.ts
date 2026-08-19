import { describe, expect, it } from 'vitest'
import { rangoFechas } from './reportes.js'

// 15 de agosto de 2026, hora local (el default se calcula en local, como /reportes).
const HOY = new Date(2026, 7, 15)

describe('rangoFechas', () => {
  it('sin argumentos usa el mes en curso y lo dice', () => {
    const r = rangoFechas(undefined, undefined, HOY)
    expect(r).toMatchObject({ desde: '2026-08-01', hasta: '2026-08-15' })
    expect(r.nota).toContain('2026-08-01')
    expect(r.nota).toContain('mes en curso')
  })

  it('respeta el rango explícito sin avisar de default', () => {
    const r = rangoFechas('2026-01-01', '2026-06-30', HOY)
    expect(r).toMatchObject({ desde: '2026-01-01', hasta: '2026-06-30' })
    expect(r.nota).not.toContain('mes en curso')
  })

  it('completa la mitad que falta y avisa cuál', () => {
    expect(rangoFechas('2026-08-10', undefined, HOY)).toMatchObject({
      desde: '2026-08-10',
      hasta: '2026-08-15',
    })
    const soloFin = rangoFechas(undefined, '2026-08-12', HOY)
    expect(soloFin.desde).toBe('2026-08-01')
    expect(soloFin.nota).toContain('inicio')
  })

  it('rellena mes y día a dos dígitos', () => {
    expect(rangoFechas(undefined, undefined, new Date(2026, 0, 5))).toMatchObject({
      desde: '2026-01-01',
      hasta: '2026-01-05',
    })
  })

  it('rechaza formato inválido y rango invertido', () => {
    expect(() => rangoFechas('01/08/2026', undefined, HOY)).toThrow(/YYYY-MM-DD/)
    expect(() => rangoFechas(undefined, '2026-8-1', HOY)).toThrow(/YYYY-MM-DD/)
    expect(() => rangoFechas('2026-08-20', '2026-08-01', HOY)).toThrow(/posterior/)
  })
})

import { describe, expect, it } from 'vitest'
import { agruparViajes } from './mis-viajes'

const v = (id: string, status: string, travel_date: string | null) => ({ id, status, travel_date })

describe('agruparViajes', () => {
  it('reparte en próximos (por fecha, sin fecha al final), pasados (más reciente primero) y cancelados', () => {
    const g = agruparViajes(
      [
        v('a', 'paid', '2026-09-20'),
        v('b', 'reserved', '2026-09-12'),
        v('c', 'paid', '2026-08-01'),
        v('d', 'paid', '2026-08-20'),
        v('e', 'cancelled', '2026-08-15'),
        v('f', 'draft', null),
        v('g', 'paid', '2026-09-10'), // hoy: sigue siendo próximo (puede estar en curso)
      ],
      '2026-09-10'
    )
    expect(g.map((x) => [x.titulo, x.items.map((i) => i.id)])).toEqual([
      ['Próximos', ['g', 'b', 'a', 'f']],
      ['Pasados', ['d', 'c']],
      ['Cancelados', ['e']],
    ])
  })
  it('un solo grupo cuando todo es próximo; ninguno si no hay pedidos', () => {
    expect(agruparViajes([v('a', 'paid', '2026-12-01')], '2026-09-10').map((x) => x.titulo)).toEqual(['Próximos'])
    expect(agruparViajes([], '2026-09-10')).toEqual([])
  })
})

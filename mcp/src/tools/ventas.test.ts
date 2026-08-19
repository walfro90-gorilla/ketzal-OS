import { describe, expect, it } from 'vitest'
import { queryVentas } from './ventas.js'
import { filtrarClientes } from './clientes.js'

const base = { campo_fecha: 'created_at' as const, limite: 25 }

describe('queryVentas', () => {
  it('sin filtros: sólo select, orden y límite', () => {
    const qs = queryVentas(base)
    expect(qs).toContain('order=created_at.desc')
    expect(qs).toContain('limit=25')
    expect(qs).not.toContain('status=')
    expect(qs).not.toContain('!inner')
  })

  it('cierra el rango de created_at con el día siguiente, no con lte', () => {
    const qs = queryVentas({ ...base, desde: '2026-08-01', hasta: '2026-08-31' })
    expect(qs).toContain('created_at=gte.2026-08-01')
    expect(qs).toContain('created_at=lt.2026-09-01')
  })

  it('travel_date es date: el corte superior es lte inclusive', () => {
    const qs = queryVentas({ ...base, campo_fecha: 'travel_date', hasta: '2026-12-31' })
    expect(qs).toContain('travel_date=lte.2026-12-31')
  })

  it('el día siguiente cruza fin de mes y año bisiesto', () => {
    expect(queryVentas({ ...base, hasta: '2026-12-31' })).toContain('lt.2027-01-01')
    expect(queryVentas({ ...base, hasta: '2028-02-28' })).toContain('lt.2028-02-29')
  })

  it('filtrar por cliente activa !inner sólo en ese embed', () => {
    const qs = queryVentas({ ...base, cliente: 'Juan' })
    expect(qs).toContain('customer:customers!inner(')
    expect(qs).toContain('service:services(')
    expect(qs).toContain('customer.full_name=ilike.*Juan*')
  })

  it('escapa el texto de búsqueda pero conserva los comodines', () => {
    const qs = queryVentas({ ...base, servicio: 'Creel & Barrancas' })
    expect(qs).toContain('service.name=ilike.*Creel%20%26%20Barrancas*')
  })
})

describe('filtrarClientes', () => {
  const rows = [
    { full_name: 'José Pérez', phone: '656 123 4567', email: null },
    { full_name: 'Ana Lopez', phone: null, email: 'ana@mail.com' },
  ] as Parameters<typeof filtrarClientes>[0]

  it('sin búsqueda devuelve todo', () => {
    expect(filtrarClientes(rows)).toHaveLength(2)
  })

  it('ignora acentos y mayúsculas', () => {
    expect(filtrarClientes(rows, 'jose perez')).toHaveLength(1)
  })

  it('ignora el formato del teléfono', () => {
    expect(filtrarClientes(rows, '6561234567')).toHaveLength(1)
  })

  it('busca también en el correo', () => {
    expect(filtrarClientes(rows, 'ANA@mail')).toHaveLength(1)
  })
})

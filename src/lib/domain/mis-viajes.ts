/**
 * Agrupa los pedidos del viajero en Próximos · Pasados · Cancelados (b106).
 * Puro: la página le pasa la lista de la RPC y el "hoy" de la agencia.
 */
export type ViajeAgrupable = { status: string; travel_date: string | null; created_at?: string }

export type Grupo<T> = { titulo: 'Próximos' | 'Pasados' | 'Cancelados'; items: T[] }

export function agruparViajes<T extends ViajeAgrupable>(orders: T[], hoy: string): Grupo<T>[] {
  const cancelados = orders.filter((o) => o.status === 'cancelled')
  const pasados = orders.filter((o) => o.status !== 'cancelled' && !!o.travel_date && o.travel_date < hoy)
  const proximos = orders.filter((o) => !cancelados.includes(o) && !pasados.includes(o))
  // Próximos: el más cercano primero (sin fecha al final); pasados: el más reciente primero.
  proximos.sort((a, b) => (a.travel_date ?? '9999').localeCompare(b.travel_date ?? '9999'))
  pasados.sort((a, b) => (b.travel_date ?? '').localeCompare(a.travel_date ?? ''))
  return (
    [
      { titulo: 'Próximos', items: proximos },
      { titulo: 'Pasados', items: pasados },
      { titulo: 'Cancelados', items: cancelados },
    ] as Grupo<T>[]
  ).filter((g) => g.items.length > 0)
}

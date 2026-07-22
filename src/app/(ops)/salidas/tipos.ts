// Formas del jsonb de ketzal.list_departures / get_departure_detail (F3).
// No están en database.types.ts (RPCs nuevos) ⇒ se estrechan con cast en la
// página, igual que reportes/comisiones.

export type Salida = {
  id: string
  service_id: string
  service: string
  departs_on: string
  max_capacity: number
  seats_taken: number
  note: string | null
  num_ventas: number
  pax_capturados: number
}

export type PasajeroManifiesto = {
  id: string
  full_name: string
  passenger_type: string | null
  doc_id: string | null
}

export type VentaManifiesto = {
  id: string
  folio: string | null
  customer: string | null
  num_pax: number
  status: string
  is_own: boolean
  selling_agency: string | null
  total: number | null
  cobrado: number | null
  saldo: number | null
  passengers: PasajeroManifiesto[]
}

export type SalidaDetalle = {
  departure: {
    id: string
    service: string
    agency: string | null
    departs_on: string
    max_capacity: number
    seats_taken: number
    note: string | null
  }
  totals: { num_ventas: number; num_pax: number; pax_capturados: number }
  money: { vendido_propio: number; cobrado_propio: number; saldo_propio: number }
  bookings: VentaManifiesto[]
}

export const ESTADO_VENTA: Record<string, string> = {
  draft: 'Borrador',
  reserved: 'Reservada',
  confirmed: 'Confirmada',
  paid: 'Pagada',
  cancelled: 'Cancelada',
}

/** "2026-08-18" → "18 ago 2026" (mediodía para no correrse por zona horaria). */
export function fmtFechaSalida(d: string): string {
  const p = new Date(`${d}T12:00:00`)
  return Number.isNaN(p.getTime())
    ? d
    : new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(p)
}

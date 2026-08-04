import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ESTADO_VENTA, fmtFechaSalida, type SalidaDetalle } from '../../tipos'
import { ImprimirManifiesto } from './imprimir'

// Manifiesto interno imprimible (con sesión — PII de pasajeros, SIN token
// público, a diferencia de recibo/estado). Lista plana de todos los pasajeros
// del camión para el pase de abordar.

type Fila = {
  n: number
  nombre: string
  tipo: string | null
  doc: string | null
  cliente: string | null
  folio: string | null
  estado: string
  /** b046: asiento asignado y hora de abordaje (buslist). */
  asiento: number | null
  abordado: string | null
}

/** Fila del RPC departure_lists (b046): pax de todo el camión con asiento. */
type BuslistRow = {
  passenger_id: string
  full_name: string
  passenger_type: string | null
  doc_id: string | null
  seat: number | null
  boarded_at: string | null
  cliente: string | null
  folio: string | null
  status: string
  agencia: string | null
}

const hora = new Intl.DateTimeFormat('es-MX', { hour: 'numeric', minute: '2-digit' })

export default async function ManifiestoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data, error }, { data: listsData }] = await Promise.all([
    supabase.rpc('get_departure_detail' as never, {
      p_departure_id: id,
    } as never),
    // b046: buslist con asiento + abordaje (RPC independiente, mismo guard).
    supabase.rpc('departure_lists' as never, { p_departure_id: id } as never),
  ])
  if (error || !data) notFound()
  const d = data as unknown as SalidaDetalle
  const buslist =
    ((listsData as unknown as { buslist?: BuslistRow[] } | null)?.buslist ?? [])

  // Buslist ordenada por asiento (sin asiento al final), numerada para el pase.
  const filas: Fila[] = buslist.map((p, i) => ({
    n: i + 1,
    nombre: p.full_name,
    tipo: p.passenger_type,
    doc: p.doc_id,
    cliente: p.cliente,
    folio: p.folio,
    estado: ESTADO_VENTA[p.status] ?? p.status,
    asiento: p.seat,
    abordado: p.boarded_at,
  }))
  // Ventas sin pasajeros capturados (para no dejar huecos silenciosos).
  const sinCaptura = d.bookings.filter((b) => b.passengers.length < b.num_pax)

  return (
    <div className="mx-auto max-w-3xl space-y-6 print:space-y-4">
      <div className="flex items-start justify-between gap-3 print:hidden">
        <Link href={`/salidas/${id}`} className="text-sm text-muted-foreground hover:underline">
          ← Volver a la salida
        </Link>
        <ImprimirManifiesto />
      </div>

      <header className="space-y-1 border-b pb-4">
        <h1 className="text-2xl font-semibold">Manifiesto de salida</h1>
        <p className="text-sm text-muted-foreground">
          {d.departure.service} · {fmtFechaSalida(d.departure.departs_on)}
          {d.departure.agency ? ` · ${d.departure.agency}` : ''}
        </p>
        <p className="text-sm">
          {filas.length} pasajero{filas.length === 1 ? '' : 's'} capturado
          {filas.length === 1 ? '' : 's'} · {d.departure.seats_taken}/
          {d.departure.max_capacity} lugares · {d.totals.num_ventas} venta
          {d.totals.num_ventas === 1 ? '' : 's'}
        </p>
      </header>

      {filas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aún no hay pasajeros capturados para esta salida.
        </p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2 pr-2 font-medium">#</th>
              <th className="py-2 pr-2 font-medium">Asiento</th>
              <th className="py-2 pr-2 font-medium">Pasajero</th>
              <th className="py-2 pr-2 font-medium">Tipo</th>
              <th className="py-2 pr-2 font-medium">Documento</th>
              <th className="py-2 pr-2 font-medium">Venta</th>
              <th className="py-2 pr-2 font-medium">Estado</th>
              <th className="py-2 font-medium">Abordó</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.n} className="border-b">
                <td className="py-1.5 pr-2 tabular-nums">{f.n}</td>
                <td className="py-1.5 pr-2 font-semibold tabular-nums">
                  {f.asiento ?? '—'}
                </td>
                <td className="py-1.5 pr-2 font-medium">{f.nombre}</td>
                <td className="py-1.5 pr-2">{f.tipo ?? '—'}</td>
                <td className="py-1.5 pr-2">{f.doc ?? '—'}</td>
                <td className="py-1.5 pr-2">
                  {f.cliente ?? '—'}
                  {f.folio ? ` · ${f.folio}` : ''}
                </td>
                <td className="py-1.5 pr-2">{f.estado}</td>
                <td className="py-1.5 tabular-nums">
                  {f.abordado ? `✓ ${hora.format(new Date(f.abordado))}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {sinCaptura.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm print:border-amber-500">
          <p className="font-medium text-amber-700 dark:text-amber-400">
            Ventas con pasajeros pendientes de capturar
          </p>
          <ul className="mt-1 list-inside list-disc text-muted-foreground">
            {sinCaptura.map((b) => (
              <li key={b.id}>
                {b.customer ?? 'Sin cliente'}
                {b.folio ? ` · ${b.folio}` : ''} — {b.passengers.length}/{b.num_pax}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ESTADO_VENTA, fmtFechaSalida, type SalidaDetalle } from '../../tipos'
import { ImprimirManifiesto } from '../manifiesto/imprimir'

// Roomlist de la salida (b046): la lista que se entrega al hotel — por venta
// (grupo/familia): ocupación (habitaciones/lugares) y nombres. Interno con
// sesión (PII), imprimible. Guard: agencia dueña del servicio o superadmin
// (RPC departure_lists, cross-tenant a propósito, SIN dinero).

type Room = {
  booking_id: string
  cliente: string | null
  folio: string | null
  status: string
  agencia: string | null
  num_pax: number
  habitaciones: { label: string; qty: number }[]
  pasajeros: string[]
}

export default async function RoomlistPage({
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
    supabase.rpc('departure_lists' as never, { p_departure_id: id } as never),
  ])
  if (error || !data) notFound()
  const d = data as unknown as SalidaDetalle
  const rooms = ((listsData as unknown as { rooms?: Room[] } | null)?.rooms ?? [])

  const totalPax = rooms.reduce((s, r) => s + r.num_pax, 0)

  return (
    <div className="mx-auto max-w-3xl space-y-6 print:space-y-4">
      <div className="flex items-start justify-between gap-3 print:hidden">
        <Link href={`/salidas/${id}`} className="text-sm text-muted-foreground hover:underline">
          ← Volver a la salida
        </Link>
        <ImprimirManifiesto />
      </div>

      <header className="space-y-1 border-b pb-4">
        <h1 className="text-2xl font-semibold">Roomlist</h1>
        <p className="text-sm text-muted-foreground">
          {d.departure.service} · {fmtFechaSalida(d.departure.departs_on)}
          {d.departure.agency ? ` · ${d.departure.agency}` : ''}
        </p>
        <p className="text-sm">
          {rooms.length} {rooms.length === 1 ? 'reservación' : 'reservaciones'} ·{' '}
          {totalPax} pax
        </p>
      </header>

      {rooms.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Sin ventas apartadas/pagadas para esta salida.
        </p>
      ) : (
        <div className="space-y-3">
          {rooms.map((r, i) => (
            <div
              key={r.booking_id}
              className="rounded-lg border p-3 text-sm break-inside-avoid"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold">
                  <span className="mr-2 tabular-nums text-muted-foreground">
                    {i + 1}.
                  </span>
                  {r.cliente ?? 'Sin cliente'}
                  {r.folio ? (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {r.folio}
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  {r.num_pax} pax · {ESTADO_VENTA[r.status] ?? r.status}
                  {r.agencia ? ` · vende ${r.agencia}` : ''}
                </p>
              </div>
              {r.habitaciones.length > 0 && (
                <p className="mt-1.5 text-muted-foreground">
                  {r.habitaciones
                    .map((h) => `${h.qty}× ${h.label}`)
                    .join(' · ')}
                </p>
              )}
              <p className="mt-1">
                {r.pasajeros.length > 0 ? (
                  r.pasajeros.join(' · ')
                ) : (
                  <span className="text-amber-700 dark:text-amber-400">
                    Pasajeros pendientes de capturar ({r.num_pax} pax)
                  </span>
                )}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

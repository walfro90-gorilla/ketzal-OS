import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { PageHeader } from '@/components/data/page-header'
import { DataList, type DataColumn } from '@/components/data/data-list'
import { mxn } from '@/components/data/format'
import { PrinterIcon } from 'lucide-react'
import { ESTADO_VENTA, fmtFechaSalida, type SalidaDetalle } from '../tipos'

type BookingRow = SalidaDetalle['bookings'][number]

const columnasVentas: DataColumn<BookingRow>[] = [
  {
    header: 'Cliente',
    primary: true,
    cell: (b) => (
      <div className="flex flex-col">
        {b.is_own ? (
          <Link href={`/ventas/${b.id}`} className="font-medium hover:underline">
            {b.customer ?? 'Sin cliente'}
          </Link>
        ) : (
          <span>{b.customer ?? 'Sin cliente'}</span>
        )}
        <span className="text-xs font-normal text-muted-foreground">
          {b.is_own
            ? `${b.passengers.length}/${b.num_pax} pax`
            : `Reventa${b.selling_agency ? ` · ${b.selling_agency}` : ''} · ${b.passengers.length}/${b.num_pax} pax`}
        </span>
      </div>
    ),
  },
  {
    header: 'Pax',
    align: 'right',
    cell: (b) => <span className="tabular-nums">{b.num_pax}</span>,
  },
  {
    header: 'Estado',
    cell: (b) => ESTADO_VENTA[b.status] ?? b.status,
  },
  {
    header: 'Total',
    align: 'right',
    cell: (b) => (
      <span className="tabular-nums">
        {b.is_own && b.total != null ? mxn.format(Number(b.total)) : '—'}
      </span>
    ),
  },
  {
    header: 'Saldo',
    align: 'right',
    cell: (b) =>
      b.is_own && b.saldo != null ? (
        <span
          className={`tabular-nums ${Number(b.saldo) > 0 ? 'text-amber-700 dark:text-amber-400' : ''}`}
        >
          {mxn.format(Number(b.saldo))}
        </span>
      ) : (
        <span className="tabular-nums">—</span>
      ),
  },
]

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export default async function SalidaDetallePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('get_departure_detail' as never, {
    p_departure_id: id,
  } as never)
  // El RPC hace raise si no eres la agencia dueña (o superadmin) ⇒ error.
  if (error || !data) notFound()
  const d = data as unknown as SalidaDetalle

  const paxCompleto =
    d.totals.pax_capturados >= d.departure.seats_taken && d.departure.seats_taken > 0

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title={d.departure.service}
        description={`Salida del ${fmtFechaSalida(d.departure.departs_on)}${
          d.departure.agency ? ` · ${d.departure.agency}` : ''
        }`}
        backHref="/salidas"
        backLabel="Volver a salidas"
        action={
          <span className="flex flex-wrap gap-2">
            <Link
              href={`/salidas/${id}/manifiesto`}
              className={buttonVariants({ variant: 'outline' })}
            >
              <PrinterIcon className="size-4" />
              Buslist
            </Link>
            <Link
              href={`/salidas/${id}/roomlist`}
              className={buttonVariants({ variant: 'outline' })}
            >
              <PrinterIcon className="size-4" />
              Roomlist
            </Link>
          </span>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Ocupación"
          value={`${d.departure.seats_taken}/${d.departure.max_capacity}`}
          hint={d.departure.seats_taken >= d.departure.max_capacity ? 'Lleno' : 'lugares'}
        />
        <Kpi
          label="Pasajeros capturados"
          value={`${d.totals.pax_capturados}/${d.departure.seats_taken}`}
          hint={paxCompleto ? 'Completo' : 'faltan nombres'}
        />
        <Kpi label="Vendido (tuyo)" value={mxn.format(Number(d.money.vendido_propio))} />
        <Kpi
          label="Saldo (tuyo)"
          value={mxn.format(Number(d.money.saldo_propio))}
          hint={`cobrado ${mxn.format(Number(d.money.cobrado_propio))}`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ventas de la salida</CardTitle>
          <CardDescription>
            Todas las ventas de este camión. Las reventas de otras agencias
            aparecen para el manifiesto, pero su dinero es privado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {d.bookings.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aún no hay ventas en esta salida.
            </p>
          ) : (
            <DataList
              columns={columnasVentas}
              rows={d.bookings}
              getRowKey={(b) => b.id}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

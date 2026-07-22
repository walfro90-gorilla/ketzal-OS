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
import { mxn } from '@/components/data/format'
import { PrinterIcon } from 'lucide-react'
import { ESTADO_VENTA, fmtFechaSalida, type SalidaDetalle } from '../tipos'

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
          <Link
            href={`/salidas/${id}/manifiesto`}
            className={buttonVariants({ variant: 'outline' })}
          >
            <PrinterIcon className="size-4" />
            Manifiesto
          </Link>
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Cliente</th>
                    <th className="py-2 pr-3 text-right font-medium">Pax</th>
                    <th className="py-2 pr-3 font-medium">Estado</th>
                    <th className="py-2 pr-3 text-right font-medium">Total</th>
                    <th className="py-2 text-right font-medium">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {d.bookings.map((b) => (
                    <tr key={b.id} className="border-b last:border-0">
                      <td className="py-2 pr-3">
                        {b.is_own ? (
                          <Link href={`/ventas/${b.id}`} className="hover:underline">
                            {b.customer ?? 'Sin cliente'}
                          </Link>
                        ) : (
                          <span>{b.customer ?? 'Sin cliente'}</span>
                        )}
                        <span className="block text-xs text-muted-foreground">
                          {b.is_own
                            ? `${b.passengers.length}/${b.num_pax} pax`
                            : `Reventa${b.selling_agency ? ` · ${b.selling_agency}` : ''} · ${b.passengers.length}/${b.num_pax} pax`}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{b.num_pax}</td>
                      <td className="py-2 pr-3">{ESTADO_VENTA[b.status] ?? b.status}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {b.is_own && b.total != null ? mxn.format(Number(b.total)) : '—'}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {b.is_own && b.saldo != null ? (
                          <span
                            className={
                              Number(b.saldo) > 0 ? 'text-amber-700 dark:text-amber-400' : ''
                            }
                          >
                            {mxn.format(Number(b.saldo))}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

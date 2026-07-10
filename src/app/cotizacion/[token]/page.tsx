import type { Metadata } from 'next'
import { getQuote } from './data'
import { ImprimirBoton } from '@/components/imprimir-boton'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// Página PÚBLICA (sin sesión): el cliente final la abre desde WhatsApp.
// Datos y tipos viven en ./data (getQuote). El preview social lo genera
// ./opengraph-image; aquí solo el <title>/<meta> vía generateMetadata.

// Formatters locales (duplicados a propósito: los de (ops)/ventas/ui.tsx
// viven en el grupo privado; esta página es pública y autocontenida).
const mxn = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
})

const dateFormatter = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' })

function formatTravelDate(date: string | null): string {
  if (!date) return 'Por definir'
  const parsed = new Date(`${date}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return date
  return dateFormatter.format(parsed)
}

const ITEM_TYPE_LABELS: Record<string, string> = {
  passenger: 'Pasajero',
  room: 'Habitación',
  addon: 'Add-on',
  custom: 'Personalizado',
}

const PASSENGER_TYPE_LABELS: Record<string, string> = {
  adult: 'Adulto',
  child: 'Niño',
  inapam: 'INAPAM',
}

const FREQ_LABEL: Record<string, string> = {
  semanal: 'semanales',
  quincenal: 'quincenales',
  mensual: 'mensuales',
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>
}): Promise<Metadata> {
  const { token } = await params
  const quote = await getQuote(token)
  if (!quote) return { title: 'Cotización', robots: { index: false } }

  const total = `${mxn.format(Number(quote.total))} ${quote.currency || 'MXN'}`
  const service = quote.service?.name ?? 'Viaje a medida'
  const title = `Cotización · ${service} — ${quote.agency.name}`
  const description = `Para ${quote.customer.full_name} · ${quote.num_pax} pax · ${formatTravelDate(quote.travel_date)} · Total ${total}`

  return {
    title,
    description,
    // Documento privado por token: fuera de buscadores (no bloquea el scrape OG).
    robots: { index: false },
    openGraph: { title, description, type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
  }
}

function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Cotización no encontrada</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          El enlace no es válido o la cotización ya no está disponible.
          Pide a tu agencia que te comparta un enlace nuevo.
        </p>
      </div>
    </main>
  )
}

export default async function CotizacionPublicaPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const quote = await getQuote(token)
  if (!quote) return <NotFound />

  // Plan de pagos: filas con saldo restante (suma pura, sin acumulador mutable).
  const total = Number(quote.total)
  const planItems = quote.plan?.items ?? []
  const planRows = planItems.map((p, i) => ({
    ...p,
    saldo:
      total -
      planItems.slice(0, i + 1).reduce((sum, x) => sum + Number(x.amount), 0),
  }))
  const numAbonos = planItems.filter((p) => p.kind === 'abono').length
  const engancheMonto =
    planItems.find((p) => p.kind === 'enganche')?.amount ?? 0

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-8 sm:py-12">
      <header className="space-y-1 text-center">
        <p className="text-2xl font-bold">{quote.agency.name}</p>
        <h1 className="text-sm font-medium tracking-widest text-muted-foreground uppercase">
          Cotización
        </h1>
      </header>

      <div className="flex justify-center print:hidden">
        <ImprimirBoton label="Descargar PDF / Imprimir" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Para {quote.customer.full_name}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Servicio</dt>
              <dd className="mt-1 font-medium">
                {quote.service?.name ?? 'A medida'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Fecha de viaje</dt>
              <dd className="mt-1 font-medium">
                {formatTravelDate(quote.travel_date)}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {quote.service?.itinerary && quote.service.itinerary.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Itinerario</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {quote.service.itinerary.map((dia, i) => (
              <div key={i}>
                <p className="text-sm font-semibold">
                  Día {i + 1}
                  {dia.title ? `: ${dia.title}` : ''}
                </p>
                {dia.description && (
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {dia.description}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detalle</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Concepto</TableHead>
                  <TableHead className="text-right">Cant.</TableHead>
                  <TableHead className="text-right">P. unitario</TableHead>
                  <TableHead className="text-right">Importe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quote.items.map((item, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <span className="font-medium">
                        {item.description ??
                          (ITEM_TYPE_LABELS[item.item_type] ?? item.item_type)}
                      </span>
                      {item.description == null && item.passenger_type && (
                        <span className="ml-1 text-muted-foreground">
                          · {PASSENGER_TYPE_LABELS[item.passenger_type] ??
                            item.passenger_type}
                        </span>
                      )}
                      {item.description != null && (
                        <span className="block text-xs text-muted-foreground">
                          {ITEM_TYPE_LABELS[item.item_type] ?? item.item_type}
                          {item.passenger_type
                            ? ` · ${PASSENGER_TYPE_LABELS[item.passenger_type] ?? item.passenger_type}`
                            : ''}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.qty}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {mxn.format(Number(item.unit_price))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {mxn.format(Number(item.line_total))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="ml-auto w-full max-w-xs space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">
                {mxn.format(Number(quote.subtotal))}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Descuento</span>
              <span className="tabular-nums">
                −{mxn.format(Number(quote.discount))}
              </span>
            </div>
            <div className="flex items-center justify-between border-t pt-2 text-lg font-bold">
              <span>Total</span>
              <span className="tabular-nums">
                {mxn.format(Number(quote.total))} MXN
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {quote.plan && planRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Plan de pagos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enganche de{' '}
              <span className="font-medium text-foreground">
                {mxn.format(Number(engancheMonto))}
              </span>{' '}
              y {numAbonos} {numAbonos === 1 ? 'abono' : 'abonos'}{' '}
              {FREQ_LABEL[quote.plan.frequency ?? ''] ?? ''}
              {quote.plan.final_date
                ? `, hasta el ${formatTravelDate(quote.plan.final_date)}`
                : ''}
              .
            </p>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Concepto</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead className="text-right">Saldo restante</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {planRows.map((p) => (
                    <TableRow key={p.seq}>
                      <TableCell className="whitespace-nowrap">
                        {formatTravelDate(p.due_date)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {p.kind === 'enganche' ? 'Enganche' : `Abono ${p.seq}`}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {mxn.format(Number(p.amount))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {mxn.format(p.saldo)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">
              El enganche aparta tu lugar. Las fechas de los abonos son la guía
              sugerida de pago.
            </p>
          </CardContent>
        </Card>
      )}

      <footer className="pb-8 text-center text-sm text-muted-foreground">
        Contáctanos para confirmar:{' '}
        {[quote.agency.contact_email, quote.agency.phone]
          .filter(Boolean)
          .join(' · ') || quote.agency.name}
      </footer>
    </main>
  )
}

import { createClient } from '@/lib/supabase/server'
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
// El acceso a los datos pasa por el RPC get_quote_by_token (SECURITY DEFINER,
// callable por anon); el token uuid es la única llave.

// El RPC devuelve jsonb: tipamos el resultado localmente y casteamos.
type QuoteItem = {
  item_type: string
  passenger_type: string | null
  description: string | null
  qty: number
  unit_price: number
  line_total: number
}

type QuoteData = {
  id: string
  status: string
  travel_date: string | null
  num_pax: number
  subtotal: number
  discount: number
  total: number
  currency: string
  created_at: string
  agency: {
    name: string
    contact_email: string | null
    phone: string | null
    logo: string | null
  }
  customer: { full_name: string }
  service: { name: string } | null
  items: QuoteItem[]
}

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
  const supabase = await createClient()

  // Sin sesión, el cliente server usa la anon key: el RPC es callable por anon.
  // Un token malformado (no-uuid) hace fallar el RPC → misma pantalla de no encontrada.
  const { data, error } = await supabase.rpc('get_quote_by_token', {
    p_token: token,
  })

  if (error || data == null) return <NotFound />
  const quote = data as unknown as QuoteData

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-8 sm:py-12">
      <header className="space-y-1 text-center">
        <p className="text-2xl font-bold">{quote.agency.name}</p>
        <h1 className="text-sm font-medium tracking-widest text-muted-foreground uppercase">
          Cotización
        </h1>
      </header>

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

      <footer className="pb-8 text-center text-sm text-muted-foreground">
        Contáctanos para confirmar:{' '}
        {[quote.agency.contact_email, quote.agency.phone]
          .filter(Boolean)
          .join(' · ') || quote.agency.name}
      </footer>
    </main>
  )
}

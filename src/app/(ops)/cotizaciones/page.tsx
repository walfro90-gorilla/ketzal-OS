import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { mxn } from '../ventas/ui'
import { CotizacionAcciones } from './cotizacion-acciones'

type QuoteRow = {
  id: string
  quote_token: string
  travel_date: string | null
  total: number
  created_at: string
  customer: { full_name: string } | null
  service: { name: string } | null
}

const createdAtFormatter = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'medium',
})

export default async function CotizacionesPage() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('bookings')
    .select(
      'id, quote_token, travel_date, total, created_at, customer:customers(full_name), service:services(name)'
    )
    .eq('status', 'draft')
    .order('created_at', { ascending: false })

  // Los tipos generados a mano no describen las relaciones (FK), así que la
  // inferencia del select anidado falla: cast estrecho del resultado.
  const quotes = (data ?? []) as unknown as QuoteRow[]

  // Nombre de la agencia del agente, para el mensaje de WhatsApp.
  let agenciaNombre = 'tu agencia'
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('supplier_id')
      .eq('id', user.id)
      .single()
    if (profile?.supplier_id) {
      const { data: agency } = await supabase
        .from('suppliers')
        .select('name')
        .eq('id', profile.supplier_id)
        .single()
      if (agency?.name) agenciaNombre = agency.name
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Cotizaciones</h1>
        <Link
          href="/ventas/nueva"
          className={buttonVariants({ variant: 'default' })}
        >
          Nueva venta
        </Link>
      </div>

      {error ? (
        <p className="text-sm text-destructive">
          Error al leer las cotizaciones: {error.message}
        </p>
      ) : quotes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aún no hay cotizaciones. Crea una desde «Nueva venta» → «Guardar como
          cotización».
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Servicio</TableHead>
              <TableHead className="text-right">Total (MXN)</TableHead>
              <TableHead>Creada</TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {quotes.map((quote) => (
              <TableRow key={quote.id}>
                <TableCell className="font-medium">
                  {quote.customer?.full_name ?? 'Sin cliente'}
                </TableCell>
                <TableCell>{quote.service?.name ?? 'A medida'}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {mxn.format(Number(quote.total))}
                </TableCell>
                <TableCell>
                  {createdAtFormatter.format(new Date(quote.created_at))}
                </TableCell>
                <TableCell>
                  <CotizacionAcciones
                    bookingId={quote.id}
                    quoteToken={quote.quote_token}
                    clienteNombre={quote.customer?.full_name ?? 'cliente'}
                    agenciaNombre={agenciaNombre}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { FileTextIcon } from 'lucide-react'
import { DataList, type DataColumn } from '@/components/data/data-list'
import { EmptyState } from '@/components/data/empty-state'
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

  const columns: DataColumn<QuoteRow>[] = [
    {
      header: 'Cliente',
      primary: true,
      cell: (q) => q.customer?.full_name ?? 'Sin cliente',
    },
    { header: 'Servicio', cell: (q) => q.service?.name ?? 'A medida' },
    {
      header: 'Total (MXN)',
      align: 'right',
      cell: (q) => (
        <span className="tabular-nums">{mxn.format(Number(q.total))}</span>
      ),
    },
    {
      header: 'Creada',
      cell: (q) => createdAtFormatter.format(new Date(q.created_at)),
    },
    {
      header: 'Acciones',
      fullWidthOnCard: true,
      cell: (q) => (
        <CotizacionAcciones
          bookingId={q.id}
          quoteToken={q.quote_token}
          clienteNombre={q.customer?.full_name ?? 'cliente'}
          agenciaNombre={agenciaNombre}
        />
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
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
      ) : (
        <DataList
          columns={columns}
          rows={quotes}
          getRowKey={(q) => q.id}
          empty={
            <EmptyState
              icon={FileTextIcon}
              title="Aún no hay cotizaciones"
              description="Crea una desde «Nueva venta» → «Guardar como cotización»."
              action={
                <Link
                  href="/ventas/nueva"
                  className={buttonVariants({ variant: 'default' })}
                >
                  Nueva venta
                </Link>
              }
            />
          }
        />
      )}
    </div>
  )
}

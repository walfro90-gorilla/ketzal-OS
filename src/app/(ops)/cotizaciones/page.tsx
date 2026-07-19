import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { FileTextIcon } from 'lucide-react'
import { EmptyState } from '@/components/data/empty-state'
import { PageHeader } from '@/components/data/page-header'
import { CotizacionesList, type QuoteRow } from './cotizaciones-list'

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
      <PageHeader
        title="Cotizaciones"
        action={
          <Link
            href="/ventas/nueva"
            className={buttonVariants({ variant: 'default' })}
          >
            Nueva venta
          </Link>
        }
      />

      {error ? (
        <p className="text-sm text-destructive">
          Error al leer las cotizaciones: {error.message}
        </p>
      ) : (
        <CotizacionesList
          rows={quotes}
          agenciaNombre={agenciaNombre}
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

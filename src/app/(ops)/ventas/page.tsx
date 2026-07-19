import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { BanknoteIcon } from 'lucide-react'
import { EmptyState } from '@/components/data/empty-state'
import { PageHeader } from '@/components/data/page-header'
import { VentasList, type SaleRow } from './ventas-list'

export default async function VentasPage() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('bookings')
    .select(
      'id, folio, travel_date, total, status, customer:customers(full_name), service:services(name)'
    )
    .order('created_at', { ascending: false })

  // Los tipos generados a mano no describen las relaciones (FK), así que la
  // inferencia del select anidado falla: cast estrecho del resultado.
  const sales = (data ?? []) as unknown as SaleRow[]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ventas"
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
          Error al leer las ventas: {error.message}
        </p>
      ) : (
        <VentasList
          rows={sales}
          empty={
            <EmptyState
              icon={BanknoteIcon}
              title="Aún no hay ventas"
              description="Cierra tu primera venta y aparecerá aquí."
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

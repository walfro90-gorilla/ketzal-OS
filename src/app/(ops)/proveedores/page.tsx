import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { Building2Icon } from 'lucide-react'
import { EmptyState } from '@/components/data/empty-state'
import { PageHeader } from '@/components/data/page-header'
import { ProveedoresList, type ProveedorRow } from './proveedores-list'

export default async function ProveedoresPage() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('suppliers')
    .select(
      'id, name, supplier_type, contact_email, phone_number, commission_rate'
    )
    .order('name')

  const proveedores = (data ?? []) as unknown as ProveedorRow[]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Proveedores"
        description="Agencias y proveedores operativos (transporte, hospedaje)."
        action={
          <Link
            href="/proveedores/nuevo"
            className={buttonVariants({ variant: 'default' })}
          >
            Nuevo proveedor
          </Link>
        }
      />

      {error ? (
        <p className="text-sm text-destructive">
          Error al leer los proveedores: {error.message}
        </p>
      ) : (
        <ProveedoresList
          rows={proveedores}
          empty={
            <EmptyState
              icon={Building2Icon}
              title="Aún no hay proveedores"
              description="Registra agencias y proveedores operativos (transporte, hospedaje)."
              action={
                <Link
                  href="/proveedores/nuevo"
                  className={buttonVariants({ variant: 'default' })}
                >
                  Nuevo proveedor
                </Link>
              }
            />
          }
        />
      )}
    </div>
  )
}

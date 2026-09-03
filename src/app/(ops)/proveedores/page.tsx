import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { Building2Icon } from 'lucide-react'
import { EmptyState } from '@/components/data/empty-state'
import { PageHeader } from '@/components/data/page-header'
import { ProveedoresList, type ProveedorRow } from './proveedores-list'

export default async function ProveedoresPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: me } = user
    ? await supabase.from('profiles').select('role, supplier_id').eq('id', user.id).maybeSingle()
    : { data: null }
  const esSuperadmin = me?.role === 'superadmin'
  // La agencia ve a SUS proveedores, no a sí misma: su ficha vive en
  // /ajustes. El superadmin sí ve las agencias (para él son proveedores).
  const miAgencia = !esSuperadmin ? (me?.supplier_id ?? null) : null

  let q = supabase
    .from('suppliers')
    .select(
      'id, name, supplier_type, contact_email, phone_number, commission_rate'
    )
  if (miAgencia) q = q.neq('id', miAgencia)
  const { data, error } = await q.order('name')

  const proveedores = (data ?? []) as unknown as ProveedorRow[]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Proveedores"
        description={
          esSuperadmin
            ? 'Agencias y proveedores operativos (transporte, hospedaje).'
            : 'Proveedores operativos de tu agencia (transporte, hospedaje).'
        }
        action={
          <Link
            href="/proveedores/nuevo"
            className={buttonVariants({ variant: 'default' })}
          >
            Nuevo proveedor
          </Link>
        }
      />

      {miAgencia && (
        <p className="text-sm text-muted-foreground">
          Los datos de tu agencia (nombre, logo, cobros en línea) se editan en{' '}
          <Link href="/ajustes" className="font-medium underline underline-offset-4">
            Configuración
          </Link>
          .
        </p>
      )}

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
              description="Registra proveedores operativos (transporte, hospedaje)."
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

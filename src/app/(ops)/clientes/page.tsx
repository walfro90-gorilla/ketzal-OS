import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { UsersIcon } from 'lucide-react'
import { EmptyState } from '@/components/data/empty-state'
import { ClientesList, type Cliente } from './clientes-list'

export default async function ClientesPage() {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('list_customers')

  // El RPC devuelve jsonb (RLS-scoped): cast estrecho del Json al shape conocido.
  const clientes = (data ?? []) as unknown as Cliente[]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Clientes</h1>
        <Link
          href="/clientes/nuevo"
          className={buttonVariants({ variant: 'default' })}
        >
          Nuevo cliente
        </Link>
      </div>

      {error ? (
        <p className="text-sm text-destructive">
          Error al leer los clientes: {error.message}
        </p>
      ) : (
        <ClientesList
          rows={clientes}
          empty={
            <EmptyState
              icon={UsersIcon}
              title="Aún no hay clientes"
              description="Da de alta tu primer cliente para empezar a venderle."
              action={
                <Link
                  href="/clientes/nuevo"
                  className={buttonVariants({ variant: 'default' })}
                >
                  Nuevo cliente
                </Link>
              }
            />
          }
        />
      )}
    </div>
  )
}

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { UsersIcon } from 'lucide-react'
import { DataList, type DataColumn } from '@/components/data/data-list'
import { EmptyState } from '@/components/data/empty-state'
import { formatTravelDate, mxn } from '../ventas/ui'

type Cliente = {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  created_at: string
  num_ventas: number
  total_comprado: number
  ultima_venta: string | null
}

const columns: DataColumn<Cliente>[] = [
  { header: 'Cliente', primary: true, cell: (c) => c.full_name },
  {
    header: 'Contacto',
    cell: (c) =>
      c.phone || c.email ? (
        <div className="flex flex-col text-xs text-muted-foreground">
          {c.phone && <span>{c.phone}</span>}
          {c.email && <span>{c.email}</span>}
        </div>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    header: '# Ventas',
    align: 'right',
    cell: (c) => <span className="tabular-nums">{c.num_ventas}</span>,
  },
  {
    header: 'Total comprado',
    align: 'right',
    cell: (c) => (
      <span className="tabular-nums">{mxn.format(Number(c.total_comprado))}</span>
    ),
  },
  {
    header: 'Última compra',
    cell: (c) => formatTravelDate(c.ultima_venta?.slice(0, 10) ?? null),
  },
]

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
        <DataList
          columns={columns}
          rows={clientes}
          getRowKey={(c) => c.id}
          rowHref={(c) => `/clientes/${c.id}`}
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

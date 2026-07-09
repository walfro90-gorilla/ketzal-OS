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

export default async function ClientesPage() {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('list_customers')

  // El RPC devuelve jsonb (RLS-scoped): cast estrecho del Json al shape conocido.
  const clientes = (data ?? []) as unknown as Cliente[]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
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
      ) : clientes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aún no hay clientes. Agrega el primero.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead className="text-right"># Ventas</TableHead>
              <TableHead className="text-right">Total comprado</TableHead>
              <TableHead>Última compra</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clientes.map((cliente) => (
              <TableRow key={cliente.id}>
                <TableCell>
                  <Link
                    href={`/clientes/${cliente.id}`}
                    className="font-medium hover:underline"
                  >
                    {cliente.full_name}
                  </Link>
                </TableCell>
                <TableCell>
                  {cliente.phone || cliente.email ? (
                    <div className="flex flex-col text-xs text-muted-foreground">
                      {cliente.phone && <span>{cliente.phone}</span>}
                      {cliente.email && <span>{cliente.email}</span>}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {cliente.num_ventas}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {mxn.format(Number(cliente.total_comprado))}
                </TableCell>
                <TableCell>
                  {formatTravelDate(cliente.ultima_venta?.slice(0, 10) ?? null)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

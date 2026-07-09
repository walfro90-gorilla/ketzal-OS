import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const TIPO_LABELS: Record<string, string> = {
  agency: 'Agencia',
  tour_operator: 'Agencia',
  transporte: 'Transporte',
  hotel: 'Hotel',
  otro: 'Otro',
}

/** Las agencias (los tenants vendedores) son las que cobran comisión. */
function esAgencia(tipo: string | null): boolean {
  return tipo === 'agency' || tipo === 'tour_operator'
}

function TipoBadge({ tipo }: { tipo: string | null }) {
  const label = tipo ? (TIPO_LABELS[tipo] ?? tipo) : 'Otro'
  return (
    <Badge variant={esAgencia(tipo) ? 'default' : 'secondary'}>{label}</Badge>
  )
}

export default async function ProveedoresPage() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('suppliers')
    .select(
      'id, name, supplier_type, contact_email, phone_number, commission_rate'
    )
    .order('name')

  const proveedores = data ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Proveedores</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Agencias y proveedores operativos (transporte, hospedaje).
          </p>
        </div>
        <Link
          href="/proveedores/nuevo"
          className={buttonVariants({ variant: 'default' })}
        >
          Nuevo proveedor
        </Link>
      </div>

      {error ? (
        <p className="text-sm text-destructive">
          Error al leer los proveedores: {error.message}
        </p>
      ) : proveedores.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aún no hay proveedores.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead className="text-right">Comisión</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {proveedores.map((proveedor) => (
              <TableRow key={proveedor.id}>
                <TableCell>
                  <Link
                    href={`/proveedores/${proveedor.id}`}
                    className="font-medium hover:underline"
                  >
                    {proveedor.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <TipoBadge tipo={proveedor.supplier_type} />
                </TableCell>
                <TableCell>
                  {proveedor.contact_email || proveedor.phone_number ? (
                    <div className="flex flex-col text-xs text-muted-foreground">
                      {proveedor.contact_email && (
                        <span>{proveedor.contact_email}</span>
                      )}
                      {proveedor.phone_number && (
                        <span>{proveedor.phone_number}</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {esAgencia(proveedor.supplier_type) ? (
                    `${Number(proveedor.commission_rate ?? 0)}%`
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

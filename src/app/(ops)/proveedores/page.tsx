import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Building2Icon } from 'lucide-react'
import { DataList, type DataColumn } from '@/components/data/data-list'
import { EmptyState } from '@/components/data/empty-state'

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

type ProveedorRow = {
  id: string
  name: string
  supplier_type: string | null
  contact_email: string | null
  phone_number: string | null
  commission_rate: number | null
}

const columns: DataColumn<ProveedorRow>[] = [
  { header: 'Nombre', primary: true, cell: (p) => p.name },
  { header: 'Tipo', cell: (p) => <TipoBadge tipo={p.supplier_type} /> },
  {
    header: 'Contacto',
    cell: (p) =>
      p.contact_email || p.phone_number ? (
        <div className="flex flex-col text-xs text-muted-foreground">
          {p.contact_email && <span>{p.contact_email}</span>}
          {p.phone_number && <span>{p.phone_number}</span>}
        </div>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    header: 'Comisión',
    align: 'right',
    cell: (p) =>
      esAgencia(p.supplier_type) ? (
        <span className="tabular-nums">{Number(p.commission_rate ?? 0)}%</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
]

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
      ) : (
        <DataList
          columns={columns}
          rows={proveedores}
          getRowKey={(p) => p.id}
          rowHref={(p) => `/proveedores/${p.id}`}
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

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ProveedorForm } from '../proveedor-form'
import { EliminarProveedor } from './eliminar-proveedor'

export default async function ProveedorDetallePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: proveedor, error } = await supabase
    .from('suppliers')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !proveedor) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Link
          href="/proveedores"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Volver a proveedores
        </Link>
        <h1 className="text-2xl font-semibold">Proveedor no encontrado</h1>
        <p className="text-sm text-muted-foreground">
          El proveedor no existe o fue eliminado.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href="/proveedores"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Volver a proveedores
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{proveedor.name}</h1>
      </div>

      <ProveedorForm
        proveedorId={proveedor.id}
        initial={{
          name: proveedor.name,
          contact_email: proveedor.contact_email ?? '',
          phone_number: proveedor.phone_number ?? '',
          address: proveedor.address ?? '',
          description: proveedor.description ?? '',
          supplier_type: proveedor.supplier_type,
          commission_rate: Number(proveedor.commission_rate ?? 0),
        }}
      />

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle>Zona de peligro</CardTitle>
          <CardDescription>
            Eliminar el proveedor es permanente. No se puede eliminar si tiene
            servicios o ventas asociadas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EliminarProveedor proveedorId={proveedor.id} />
        </CardContent>
      </Card>
    </div>
  )
}

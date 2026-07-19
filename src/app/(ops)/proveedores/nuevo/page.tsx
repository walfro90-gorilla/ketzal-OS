import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/data/page-header'
import { ProveedorForm } from '../proveedor-form'

export default async function NuevoProveedorPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Nuevo proveedor"
        backHref="/proveedores"
        backLabel="Volver a proveedores"
      />

      <ProveedorForm />
    </div>
  )
}

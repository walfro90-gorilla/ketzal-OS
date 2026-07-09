import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProveedorForm } from '../proveedor-form'

export default async function NuevoProveedorPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href="/proveedores"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Volver a proveedores
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Nuevo proveedor</h1>
      </div>

      <ProveedorForm />
    </div>
  )
}

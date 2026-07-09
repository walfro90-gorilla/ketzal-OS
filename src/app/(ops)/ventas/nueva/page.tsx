import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { NuevaVentaForm } from './nueva-venta-form'

export default async function NuevaVentaPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [customersRes, servicesRes] = await Promise.all([
    supabase
      .from('customers')
      .select('id, full_name')
      .order('full_name', { ascending: true }),
    supabase
      .from('services')
      .select('id, name, price')
      .order('name', { ascending: true }),
  ])

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link
          href="/ventas"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Volver a ventas
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Nueva venta</h1>
      </div>

      {(customersRes.error || servicesRes.error) && (
        <p className="text-sm text-destructive">
          Error al cargar catálogos:{' '}
          {customersRes.error?.message ?? servicesRes.error?.message}
        </p>
      )}

      <NuevaVentaForm
        customers={customersRes.data ?? []}
        services={servicesRes.data ?? []}
      />
    </div>
  )
}

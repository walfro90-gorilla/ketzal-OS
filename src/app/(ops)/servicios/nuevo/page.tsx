import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/data/page-header'
import { ServicioForm } from '../servicio-form'

export default async function NuevoServicioPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [agenciasRes, profileRes] = await Promise.all([
    supabase
      .from('suppliers')
      .select('id, name')
      .eq('supplier_type', 'agency')
      .order('name'),
    supabase.from('profiles').select('supplier_id').eq('id', user.id).single(),
  ])

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Nuevo servicio"
        backHref="/servicios"
        backLabel="Volver a servicios"
      />

      {agenciasRes.error && (
        <p className="text-sm text-destructive">
          Error al cargar las agencias: {agenciasRes.error.message}
        </p>
      )}

      <ServicioForm
        agencias={agenciasRes.data ?? []}
        defaultSupplierId={profileRes.data?.supplier_id ?? undefined}
      />
    </div>
  )
}

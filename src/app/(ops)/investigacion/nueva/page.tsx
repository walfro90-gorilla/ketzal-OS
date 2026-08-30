import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/data/page-header'
import { EncuestaForm } from '../encuesta-form'
import type { AgenciaOpcion } from '../tipos'

export default async function NuevaEncuestaPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // El superadmin no tiene agencia propia: tiene que elegir a nombre de quién
  // va la encuesta. El admin de agencia no ve el selector — su encuesta la
  // fija el default `my_supplier_id()` de la columna.
  let agencias: AgenciaOpcion[] = []
  if (user) {
    const { data: yo } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (yo?.role === 'superadmin') {
      const { data } = await supabase
        .from('suppliers')
        .select('id, name')
        .eq('supplier_type', 'agency')
        .order('name')
      agencias = (data as AgenciaOpcion[]) ?? []
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nueva encuesta"
        description="Nace en borrador: la abres cuando el anuncio esté listo."
        backHref="/investigacion"
        backLabel="Investigación"
      />
      <EncuestaForm agencias={agencias} />
    </div>
  )
}

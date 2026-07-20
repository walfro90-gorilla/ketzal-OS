import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/data/page-header'
import { getBrandLogo } from '@/lib/brand'
import { LogoConfig } from './logo-config'

// Ajustes de plataforma (solo superadmin). Hoy: el logo oficial. La escritura
// está protegida por RLS (app_settings_write = is_superadmin); aquí además se
// gatea la vista para no mostrarla a admins de agencia.
export default async function AjustesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profile } = user
    ? await supabase.from('profiles').select('role').eq('id', user.id).single()
    : { data: null }

  if (profile?.role !== 'superadmin') {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader
          title="Ajustes"
          description="Solo el superadmin puede ver los ajustes de la plataforma."
        />
      </div>
    )
  }

  const logo = await getBrandLogo()

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Ajustes"
        description="Configuración de la plataforma Ketzal."
      />
      <LogoConfig initialLogo={logo} />
    </div>
  )
}

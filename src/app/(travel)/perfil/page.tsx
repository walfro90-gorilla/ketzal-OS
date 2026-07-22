import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PerfilForm } from './perfil-form'

// Perfil del viajero: sus datos de contacto (nombre/teléfono) y cerrar sesión.
// Sin acceso a nada del back-office.
export const metadata = { robots: { index: false } }

export default async function PerfilPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // marketplace_customers: tabla nueva no tipada ⇒ cast (convención del repo).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: customer } = await (supabase as any)
    .from('marketplace_customers')
    .select('full_name, phone')
    .eq('id', user.id)
    .maybeSingle()

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-8 sm:py-12">
      <h1 className="text-2xl font-bold tracking-tight">Perfil</h1>
      <p className="mt-1 text-sm text-muted-foreground">{user.email}</p>
      <PerfilForm
        nombre={customer?.full_name ?? ''}
        telefono={customer?.phone ?? ''}
      />
    </div>
  )
}

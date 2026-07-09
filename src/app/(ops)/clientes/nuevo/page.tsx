import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ClienteForm } from '../cliente-form'

export default async function NuevoClientePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href="/clientes"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Volver a clientes
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Nuevo cliente</h1>
      </div>

      <ClienteForm />
    </div>
  )
}

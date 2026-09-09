import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { PerfilForm } from './perfil-form'

// Perfil del viajero: sus datos y su perfil social (apodo, viaje soñado…). El
// perfil social sólo se muestra a compañeros de viaje si el viajero lo prende
// (`is_public`, apagado por default) — eso lo lee la Fase 2. Sin back-office.
export const metadata = { robots: { index: false } }

export default async function PerfilPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // profiles.type/phone y los campos sociales no están en los tipos ⇒ cast.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: p } = await (supabase as any)
    .from('profiles')
    .select('name, phone, nickname, dream_trip, bio, city, is_public, social_photo_path')
    .eq('id', user.id)
    .maybeSingle()

  // La foto vive en el bucket privado: se firma en el servidor (el cliente del
  // usuario no tiene SELECT sobre ketzal-privado). Sólo su propia foto.
  let fotoUrl: string | null = null
  if (p?.social_photo_path) {
    const { data: firma } = await createServiceClient()
      .storage.from('ketzal-privado')
      .createSignedUrl(p.social_photo_path as string, 300)
    fotoUrl = firma?.signedUrl ?? null
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-8 sm:py-12">
      <h1 className="text-2xl font-bold tracking-tight">Perfil</h1>
      <p className="mt-1 text-sm text-muted-foreground">{user.email}</p>
      <PerfilForm
        nombre={p?.name ?? ''}
        telefono={p?.phone ?? ''}
        apodo={p?.nickname ?? ''}
        viajeSonado={p?.dream_trip ?? ''}
        bio={p?.bio ?? ''}
        ciudad={p?.city ?? ''}
        publico={Boolean(p?.is_public)}
        fotoUrl={fotoUrl}
        fotoPath={(p?.social_photo_path as string | null) ?? null}
      />
    </div>
  )
}

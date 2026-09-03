import { createClient } from '@/lib/supabase/server'
import { isAdminRole } from '@/lib/access'
import { PageHeader } from '@/components/data/page-header'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { getBrandLogo } from '@/lib/brand'
import { ProveedorForm } from '../proveedores/proveedor-form'
import { type ProveedorInfo } from '../proveedores/actions'
import { AccionesProveedor } from '../proveedores/[id]/acciones-proveedor'
import { CobrosMp, avisoMp } from '../proveedores/[id]/cobros-mp'
import { LogoConfig } from './logo-config'
import { WaConfig } from './wa-config'
import { estadoWhatsApp } from './wa-actions'

// Configuración. Dos ámbitos en una página:
//  · "Mi agencia" (admin de agencia y cualquier admin con agencia): nombre,
//    logo, fotos, perfil público y cobros en línea (MP). Antes esto solo se
//    alcanzaba entrando a la PROPIA fila en /proveedores — donde deben vivir los
//    proveedores de la agencia, no la agencia. /proveedores/[id] redirige aquí.
//  · "Plataforma Ketzal" (solo superadmin): marca y WhatsApp de Clawbot. La
//    escritura la protege RLS (app_settings_write = is_superadmin); aquí además
//    se gatea la vista.
export default async function AjustesPage({
  searchParams,
}: {
  searchParams: Promise<{ mp?: string }>
}) {
  const { mp } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profile } = user
    ? await supabase
        .from('profiles')
        .select('role, supplier_id')
        .eq('id', user.id)
        .single()
    : { data: null }

  if (!isAdminRole(profile?.role)) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader
          title="Configuración"
          description="Solo el administrador de la agencia puede cambiar su configuración."
        />
      </div>
    )
  }
  const esSuperadmin = profile?.role === 'superadmin'

  // Mi agencia (si la persona tiene una).
  const { data: agencia } = profile?.supplier_id
    ? await supabase.from('suppliers').select('*').eq('id', profile.supplier_id).maybeSingle()
    : { data: null }
  const [{ data: perfilPublico }, { data: mpStatusData }] = agencia
    ? await Promise.all([
        supabase.rpc('get_public_supplier' as never, { p_id: agencia.id } as never),
        agencia.supplier_type === 'agency'
          ? supabase.rpc('mp_account_status' as never, { p_supplier: agencia.id } as never)
          : Promise.resolve({ data: null }),
      ])
    : [{ data: null }, { data: null }]
  const mpStatus = mpStatusData as unknown as { connected?: boolean; mp_user_id?: string } | null

  // Plataforma (solo superadmin). El estado de WhatsApp se lee aquí para que la
  // tarjeta pinte ya con datos; de ahí en adelante el componente lo refresca solo.
  const logo = esSuperadmin ? await getBrandLogo() : null
  const wa = esSuperadmin ? await estadoWhatsApp() : null

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Configuración"
        description={
          agencia
            ? esSuperadmin
              ? 'Tu agencia y la plataforma Ketzal.'
              : 'Los datos de tu agencia: nombre, logo, perfil público y cobros en línea.'
            : 'Configuración de la plataforma Ketzal.'
        }
      />

      {agencia && (
        <section className="space-y-6" aria-labelledby="mi-agencia">
          <h2 id="mi-agencia" className="text-lg font-semibold">
            Mi agencia
          </h2>
          <Card>
            <CardHeader>
              <CardTitle>{agencia.name}</CardTitle>
              <CardDescription>
                Abre o comparte tu perfil público; así lo ven tus clientes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AccionesProveedor
                proveedorId={agencia.id}
                tienePerfilPublico={perfilPublico != null}
                phone={agencia.phone_number}
                email={agencia.contact_email}
                website={(agencia as { info?: ProveedorInfo | null }).info?.website ?? null}
              />
            </CardContent>
          </Card>

          {agencia.supplier_type === 'agency' && (
            <CobrosMp
              supplierId={agencia.id}
              conectado={Boolean(mpStatus?.connected)}
              mpUserId={mpStatus?.mp_user_id ?? null}
              aviso={avisoMp(mp)}
            />
          )}

          <ProveedorForm
            proveedorId={agencia.id}
            initial={{
              name: agencia.name,
              contact_email: agencia.contact_email ?? '',
              phone_number: agencia.phone_number ?? '',
              address: agencia.address ?? '',
              description: agencia.description ?? '',
              supplier_type: agencia.supplier_type,
              commission_rate: Number(agencia.commission_rate ?? 0),
              referral_code:
                (agencia as { referral_code?: string | null }).referral_code ?? null,
              // img_logo / photos / info no están en los types generados ⇒ cast.
              img_logo: (agencia as { img_logo?: string | null }).img_logo ?? null,
              photos: Array.isArray((agencia as { photos?: unknown }).photos)
                ? ((agencia as { photos?: string[] }).photos as string[])
                : [],
              info:
                ((agencia as { info?: ProveedorInfo | null }).info as ProveedorInfo) ?? {},
            }}
          />
        </section>
      )}

      {esSuperadmin && (
        <section className="space-y-6" aria-labelledby="plataforma">
          <h2 id="plataforma" className="text-lg font-semibold">
            Plataforma Ketzal
          </h2>
          <LogoConfig initialLogo={logo} />
          {wa && !('error' in wa) && <WaConfig inicial={wa} />}
        </section>
      )}
    </div>
  )
}

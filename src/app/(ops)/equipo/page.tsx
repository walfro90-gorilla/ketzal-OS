import { createClient } from '@/lib/supabase/server'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { EquipoList } from './equipo-list'
import type { Miembro } from './miembro-acciones'
import { TasaPlataformaForm } from './tasa-plataforma-form'

export default async function EquipoPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    // El middleware protege esta ruta; esto es solo defensa extra.
    return <p className="text-sm text-muted-foreground">Sesión no válida.</p>
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, supplier_id')
    .eq('id', user.id)
    .single()

  const viewerRole = profile?.role
  if (viewerRole !== 'superadmin' && viewerRole !== 'admin') {
    return (
      <p className="text-sm text-muted-foreground">
        No tienes acceso a esta sección.
      </p>
    )
  }
  const isSuperadmin = viewerRole === 'superadmin'

  // Vía RPC y no `from('suppliers')`: desde la migración 006 la RLS sólo deja
  // ver tu agencia y tus proveedores. `list_agency_names` es SECURITY DEFINER y
  // devuelve sólo id + nombre, que es cuanto necesita el selector de agencia.
  const [teamRes, agenciasRes, settingsRes] = await Promise.all([
    supabase.rpc('list_team'),
    supabase.rpc('list_agency_names' as never),
    supabase
      .from('app_settings')
      .select('platform_commission_rate')
      .eq('id', 1)
      .single(),
  ])

  const miembros = (teamRes.data ?? []) as unknown as Miembro[]
  const agencias = (agenciasRes.data ?? []) as { id: string; name: string }[]
  const platformRate = Number(settingsRes.data?.platform_commission_rate ?? 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Equipo</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Agentes de venta: de agencia o libres de Ketzal.
        </p>
      </div>

      {isSuperadmin && (
        <Card>
          <CardHeader>
            <CardTitle>Comisión de plataforma</CardTitle>
            <CardDescription>
              El % que Ketzal gana en las ventas de los agentes libres.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {settingsRes.error ? (
              <p className="text-sm text-destructive">
                Error al cargar la comisión de plataforma: {settingsRes.error.message}
              </p>
            ) : (
              <TasaPlataformaForm initialRate={platformRate} />
            )}
          </CardContent>
        </Card>
      )}

      {teamRes.error && (
        <p className="text-sm text-destructive">
          Error al cargar el equipo: {teamRes.error.message}
        </p>
      )}
      {agenciasRes.error && (
        <p className="text-sm text-destructive">
          Error al cargar las agencias: {agenciasRes.error.message}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Miembros</CardTitle>
          <CardDescription>
            Los usuarios nuevos nacen pendientes; apruébalos para que puedan
            vender.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EquipoList
            rows={miembros}
            agencias={agencias}
            isSuperadmin={isSuperadmin}
            empty={
              <p className="text-sm text-muted-foreground">
                Aún no hay miembros en el equipo.
              </p>
            }
          />
        </CardContent>
      </Card>
    </div>
  )
}

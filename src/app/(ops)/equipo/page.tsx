import { UsersRoundIcon, UserRoundIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { EmptyState } from '@/components/data/empty-state'
import { PageHeader } from '@/components/data/page-header'
import { EquipoList } from './equipo-list'
import type { Miembro } from './miembro-acciones'
import { TasaPlataformaForm } from './tasa-plataforma-form'
import { ViajerosList, type Viajero } from './viajeros-list'

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

  // Viajeros (compradores B2C): solo el god admin. RPC DEFINER gateado a
  // superadmin; si aún no existe, degradamos a lista vacía sin romper la página.
  let viajeros: Viajero[] = []
  if (isSuperadmin) {
    const viajerosRes = await supabase.rpc('list_travelers' as never)
    if (!viajerosRes.error) {
      viajeros = (viajerosRes.data ?? []) as unknown as Viajero[]
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Equipo"
        description="Agentes de venta: de agencia o libres de Ketzal."
      />

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
              <EmptyState
                icon={UsersRoundIcon}
                title="Aún no hay miembros en el equipo"
                description="Cuando alguien se registre aparecerá aquí para aprobarlo."
              />
            }
          />
        </CardContent>
      </Card>

      {isSuperadmin && (
        <Card>
          <CardHeader>
            <CardTitle>Viajeros</CardTitle>
            <CardDescription>
              Compradores del marketplace (cuentas B2C). Solo visibles para el
              god admin.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ViajerosList
              rows={viajeros}
              empty={
                <EmptyState
                  icon={UserRoundIcon}
                  title="Aún no hay viajeros"
                  description="Cuando alguien cree una cuenta de comprador en el marketplace aparecerá aquí."
                />
              }
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

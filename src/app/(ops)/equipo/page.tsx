import { UsersRoundIcon } from 'lucide-react'
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
import { MetasSection, type MetaRow } from './metas-section'
import { InvitacionesSection, type Invitacion } from './invitaciones-section'
import { CrearAgenciaSection } from './crear-agencia-section'

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
  const hoyIso = new Date().toISOString().slice(0, 10)
  const [teamRes, agenciasRes, settingsRes, goalsRes, invitesRes] = await Promise.all([
    supabase.rpc('list_team'),
    supabase.rpc('list_agency_names' as never),
    supabase
      .from('app_settings')
      .select('platform_commission_rate')
      .eq('id', 1)
      .single(),
    supabase.rpc('goals_progress' as never, { p_month: hoyIso } as never),
    supabase.rpc('list_agency_invitations' as never),
  ])

  const miembros = (teamRes.data ?? []) as unknown as Miembro[]
  const agencias = (agenciasRes.data ?? []) as { id: string; name: string }[]
  const platformRate = Number(settingsRes.data?.platform_commission_rate ?? 0)
  const invitaciones = (invitesRes.data ?? []) as unknown as Invitacion[]

  // F5: metas del mes. Cruza el equipo (agentes de agencia) con goals_progress.
  const goals = (goalsRes.data ?? {}) as {
    agencia?: { goal?: number; vendido?: number }
    agentes?: { agent_id: string; goal?: number; vendido?: number }[]
  }
  const goalById = new Map((goals.agentes ?? []).map((a) => [a.agent_id, a]))
  const agenciaMeta: MetaRow = {
    id: null,
    nombre: 'Meta de la agencia',
    goal: Number(goals.agencia?.goal ?? 0),
    vendido: Number(goals.agencia?.vendido ?? 0),
  }
  const agentesMeta: MetaRow[] = miembros
    .filter((m) => m.active && m.supplier_id != null)
    .map((m) => {
      const g = goalById.get(m.id)
      return {
        id: m.id,
        nombre: m.name ?? m.email ?? 'Agente',
        goal: Number(g?.goal ?? 0),
        vendido: Number(g?.vendido ?? 0),
      }
    })
  const mesLabel = new Intl.DateTimeFormat('es-MX', {
    month: 'long',
    year: 'numeric',
  }).format(new Date())

  return (
    <div className="space-y-6">
      <PageHeader
        title="Equipo"
        description="Agentes de venta: de agencia o libres de Ketzal."
      />

      {isSuperadmin && <CrearAgenciaSection />}

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
            viewerId={user.id}
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

      {invitesRes.error && (
        <p className="text-sm text-destructive">
          Error al cargar las invitaciones: {invitesRes.error.message}
        </p>
      )}
      <InvitacionesSection
        invitaciones={invitaciones}
        agencias={agencias}
        isSuperadmin={isSuperadmin}
      />

      <MetasSection month={mesLabel} agencia={agenciaMeta} agentes={agentesMeta} />
    </div>
  )
}

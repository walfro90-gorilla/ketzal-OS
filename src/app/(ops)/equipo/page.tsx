import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { DataList, type DataColumn } from '@/components/data/data-list'
import { MiembroAcciones, type Miembro } from './miembro-acciones'
import { TasaPlataformaForm } from './tasa-plataforma-form'

const ROLE_LABELS: Record<Miembro['role'], string> = {
  user: 'Agente',
  admin: 'Admin',
  superadmin: 'Superadmin',
}

function RolBadge({ role }: { role: Miembro['role'] }) {
  const variant =
    role === 'superadmin' ? 'default' : role === 'admin' ? 'secondary' : 'outline'
  return <Badge variant={variant}>{ROLE_LABELS[role] ?? role}</Badge>
}

function EstadoBadge({ active }: { active: boolean }) {
  if (active) {
    return <Badge className="bg-emerald-600 text-white">Activo</Badge>
  }
  return (
    <Badge
      variant="outline"
      className="border-amber-500/50 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
    >
      Pendiente
    </Badge>
  )
}

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

  const [teamRes, agenciasRes, settingsRes] = await Promise.all([
    supabase.rpc('list_team'),
    supabase
      .from('suppliers')
      .select('id, name')
      .eq('supplier_type', 'agency')
      .order('name'),
    supabase
      .from('app_settings')
      .select('platform_commission_rate')
      .eq('id', 1)
      .single(),
  ])

  const miembros = (teamRes.data ?? []) as unknown as Miembro[]
  const agencias = agenciasRes.data ?? []
  const platformRate = Number(settingsRes.data?.platform_commission_rate ?? 0)

  const columns: DataColumn<Miembro>[] = [
    { header: 'Correo', primary: true, cell: (m) => m.email ?? '—' },
    { header: 'Nombre', cell: (m) => m.name ?? '—' },
    { header: 'Rol', cell: (m) => <RolBadge role={m.role} /> },
    { header: 'Vínculo', cell: (m) => m.agency ?? 'Libre' },
    { header: 'Estado', cell: (m) => <EstadoBadge active={m.active} /> },
    {
      header: '# Ventas',
      align: 'right',
      cell: (m) => <span className="tabular-nums">{m.num_ventas}</span>,
    },
    {
      header: 'Acciones',
      fullWidthOnCard: true,
      cell: (m) => (
        <MiembroAcciones
          miembro={m}
          agencias={agencias}
          isSuperadmin={isSuperadmin}
        />
      ),
    },
  ]

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
          <DataList
            columns={columns}
            rows={miembros}
            getRowKey={(m) => m.id}
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

import { UsersRoundIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/data/page-header'
import { EmptyState } from '@/components/data/empty-state'
import { StatTile } from '@/components/data/stat-tile'
import { assertAdmin } from './guard'
import { UsuariosList, type UsuarioRow } from './usuarios-list'

const TIPO_PLURAL: Record<string, string> = {
  agente: 'agentes',
  viajero: 'viajeros',
  embajador: 'embajadores',
  proveedor: 'proveedores',
}

export default async function UsuariosPage() {
  const { supabase, role } = await assertAdmin()

  // `list_users` ya acota por `can_view_user`: el superadmin ve todas las
  // cuentas, el admin de agencia sólo las suyas. Aquí no se filtra nada.
  // (b093: las cuentas efímeras de los hard-tests las esconde el RPC; vivían
  // segundos y desaparecían debajo del cursor.)
  const { data } = await supabase.rpc('list_users' as never)
  const usuarios = (data ?? []) as unknown as UsuarioRow[]

  // Lo que un admin necesita saber sin leer la tabla: a quién le falta
  // aprobación, quién no puede entrar y cuánta de esta gente sigue viva.
  const pendientes = usuarios.filter((u) => !u.activo && !u.sin_cuenta_auth).length
  const sinAcceso = usuarios.filter((u) => u.sin_cuenta_auth).length
  const hace30 = Date.now() - 30 * 24 * 60 * 60 * 1000
  const recientes = usuarios.filter(
    (u) => u.ultimo_acceso && new Date(u.ultimo_acceso).getTime() >= hace30
  ).length

  const porTipo = Object.entries(
    usuarios.reduce<Record<string, number>>((acc, u) => {
      const k = u.tipo ?? 'sin tipo'
      acc[k] = (acc[k] ?? 0) + 1
      return acc
    }, {})
  ).sort((a, b) => b[1] - a[1])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuarios"
        description={
          role === 'superadmin'
            ? 'Todas las cuentas del sistema: agentes, viajeros, embajadores y proveedores. Entra a una para ver su expediente completo.'
            : 'Las cuentas de tu agencia. Entra a una para ver su expediente completo.'
        }
      />

      {usuarios.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="Cuentas"
            value={usuarios.length}
            hint={
              porTipo.length
                ? porTipo
                    .map(([t, n]) => `${n} ${TIPO_PLURAL[t] ?? t}`)
                    .join(' · ')
                : undefined
            }
          />
          <StatTile
            label="Pendientes de aprobación"
            value={pendientes}
            tone={pendientes ? 'warn' : 'neutral'}
            hint={pendientes ? 'No entran hasta que las apruebes' : 'Nadie esperando'}
          />
          <StatTile
            label="Sin cuenta de acceso"
            value={sinAcceso}
            tone={sinAcceso ? 'bad' : 'neutral'}
            hint={
              sinAcceso
                ? 'Tienen perfil pero ya no existen en Auth'
                : 'Todas pueden entrar'
            }
          />
          <StatTile
            label="Entraron en 30 días"
            value={recientes}
            tone={recientes ? 'good' : 'neutral'}
            hint={`de ${usuarios.length} cuentas`}
          />
        </div>
      )}

      <Card>
        <CardContent className="pt-6">
          <UsuariosList
            rows={usuarios}
            empty={
              <EmptyState
                icon={UsersRoundIcon}
                title="Sin cuentas todavía"
                description="Cuando alguien entre por primera vez o lo invites a tu agencia, aparecerá aquí."
              />
            }
          />
        </CardContent>
      </Card>
    </div>
  )
}

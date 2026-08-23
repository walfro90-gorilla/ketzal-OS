import { UsersRoundIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/data/page-header'
import { EmptyState } from '@/components/data/empty-state'
import { assertAdmin } from './guard'
import { UsuariosList, type UsuarioRow } from './usuarios-list'

export default async function UsuariosPage() {
  const { supabase, role } = await assertAdmin()

  // `list_users` ya acota por `can_view_user`: el superadmin ve todas las
  // cuentas, el admin de agencia sólo las suyas. Aquí no se filtra nada.
  const { data } = await supabase.rpc('list_users' as never)
  const usuarios = (data ?? []) as unknown as UsuarioRow[]

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

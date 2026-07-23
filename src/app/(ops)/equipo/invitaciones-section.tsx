'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { MailPlusIcon } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Badge } from '@/components/ui/badge'
import type { Database } from '@/lib/db/database.types'
import type { AgenciaOption } from './miembro-acciones'
import { invitarAgente, revocarInvitacion } from './invitaciones-actions'

type UserRole = Database['ketzal']['Enums']['user_role']

// Forma de cada elemento de list_agency_invitations() (jsonb ⇒ cast en la página).
export type Invitacion = {
  id: string
  email: string
  role: UserRole
  supplier_id: string
  agency: string | null
  created_at: string
}

const ROL_LABEL: Record<string, string> = { user: 'Agente', admin: 'Admin' }

export function InvitacionesSection({
  invitaciones,
  agencias,
  isSuperadmin,
}: {
  invitaciones: Invitacion[]
  agencias: AgenciaOption[]
  isSuperadmin: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [email, setEmail] = useState('')
  const [rol, setRol] = useState<UserRole>('user')
  // El superadmin debe elegir agencia destino; el admin invita a la suya.
  const [agencia, setAgencia] = useState('')

  function invitar() {
    const correo = email.trim()
    if (!correo) {
      toast.error('Escribe un correo.')
      return
    }
    if (isSuperadmin && !agencia) {
      toast.error('Elige la agencia destino.')
      return
    }
    startTransition(async () => {
      const res = await invitarAgente(
        correo,
        rol,
        isSuperadmin ? agencia : null
      )
      if ('error' in res) {
        toast.error(res.error)
      } else {
        toast.success('Invitación enviada')
        setEmail('')
        router.refresh()
      }
    })
  }

  function revocar(id: string, correo: string) {
    if (!window.confirm(`¿Revocar la invitación de ${correo}?`)) return
    startTransition(async () => {
      const res = await revocarInvitacion(id)
      if ('error' in res) toast.error(res.error)
      else {
        toast.success('Invitación revocada')
        router.refresh()
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invitar agentes</CardTitle>
        <CardDescription>
          Invita por correo. Al entrar por primera vez con ese correo, la persona
          se une a la agencia con el rol que le des —sin que tú tengas que
          aprobarla después.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-52 flex-1">
            <label className="mb-1 block text-xs text-muted-foreground" htmlFor="inv-email">
              Correo
            </label>
            <Input
              id="inv-email"
              type="email"
              inputMode="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="agente@correo.com"
              className="h-10"
              disabled={isPending}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-muted-foreground" htmlFor="inv-rol">
              Rol
            </label>
            <NativeSelect
              id="inv-rol"
              className="h-10 w-32"
              value={rol}
              disabled={isPending}
              onChange={(e) => setRol(e.target.value as UserRole)}
            >
              <option value="user">Agente</option>
              <option value="admin">Admin</option>
            </NativeSelect>
          </div>

          {isSuperadmin && (
            <div>
              <label className="mb-1 block text-xs text-muted-foreground" htmlFor="inv-agencia">
                Agencia
              </label>
              <NativeSelect
                id="inv-agencia"
                className="h-10 w-44"
                value={agencia}
                disabled={isPending}
                onChange={(e) => setAgencia(e.target.value)}
              >
                <option value="">— Elige agencia —</option>
                {agencias.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}

          <Button type="button" className="h-10" onClick={invitar} disabled={isPending}>
            <MailPlusIcon className="mr-1 size-4" />
            Invitar
          </Button>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">Invitaciones pendientes</p>
          {invitaciones.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay invitaciones pendientes.
            </p>
          ) : (
            <ul className="divide-y">
              {invitaciones.map((inv) => (
                <li
                  key={inv.id}
                  className="flex flex-wrap items-center gap-2 py-2"
                >
                  <span className="min-w-40 flex-1 text-sm">{inv.email}</span>
                  <Badge variant={inv.role === 'admin' ? 'secondary' : 'outline'}>
                    {ROL_LABEL[inv.role] ?? inv.role}
                  </Badge>
                  {isSuperadmin && inv.agency && (
                    <span className="text-xs text-muted-foreground">{inv.agency}</span>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9"
                    disabled={isPending}
                    onClick={() => revocar(inv.id, inv.email)}
                  >
                    Revocar
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

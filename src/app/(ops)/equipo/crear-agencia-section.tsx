'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Building2Icon } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { crearAgenciaEInvitarAdmin } from './invitaciones-actions'

// P3 (SaaS delegado): onboarding de una agencia en un paso. Solo superadmin (la
// página ya lo gatea, y el RPC/RLS también). Crea la agencia e invita a su admin;
// el admin entra por primera vez con ese correo y ya gestiona su equipo solo.
export function CrearAgenciaSection() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [nombre, setNombre] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [contacto, setContacto] = useState('')
  const [comision, setComision] = useState('')

  function crear() {
    if (!nombre.trim()) {
      toast.error('Escribe el nombre de la agencia.')
      return
    }
    if (!adminEmail.trim()) {
      toast.error('Escribe el correo del admin a invitar.')
      return
    }
    const rate = comision.trim() === '' ? 0 : Number(comision)
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      toast.error('La comisión debe estar entre 0 y 100.')
      return
    }
    startTransition(async () => {
      const res = await crearAgenciaEInvitarAdmin({
        nombre: nombre.trim(),
        adminEmail: adminEmail.trim(),
        commissionRate: rate,
        contactEmail: contacto.trim() || undefined,
      })
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      if (res.warning) toast.warning(res.warning)
      else toast.success('Agencia creada e invitación enviada')
      setNombre('')
      setAdminEmail('')
      setContacto('')
      setComision('')
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Crear agencia</CardTitle>
        <CardDescription>
          Da de alta una agencia e invita a su administrador de una vez. Al
          entrar por primera vez con ese correo, esa persona queda como admin de
          la agencia y la gestiona sola (invita a su equipo, cobra, etc.).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-52 flex-1">
            <label className="mb-1 block text-xs text-muted-foreground" htmlFor="ag-nombre">
              Nombre de la agencia
            </label>
            <Input
              id="ag-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Wanderlust Travels"
              className="h-10"
              disabled={isPending}
            />
          </div>

          <div className="min-w-52 flex-1">
            <label className="mb-1 block text-xs text-muted-foreground" htmlFor="ag-admin">
              Correo del admin
            </label>
            <Input
              id="ag-admin"
              type="email"
              inputMode="email"
              autoComplete="off"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              placeholder="admin@agencia.com"
              className="h-10"
              disabled={isPending}
            />
          </div>

          <div className="min-w-52 flex-1">
            <label className="mb-1 block text-xs text-muted-foreground" htmlFor="ag-contacto">
              Correo de contacto (opcional)
            </label>
            <Input
              id="ag-contacto"
              type="email"
              inputMode="email"
              autoComplete="off"
              value={contacto}
              onChange={(e) => setContacto(e.target.value)}
              placeholder="contacto@agencia.com"
              className="h-10"
              disabled={isPending}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-muted-foreground" htmlFor="ag-comision">
              Comisión %
            </label>
            <Input
              id="ag-comision"
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step="0.5"
              value={comision}
              onChange={(e) => setComision(e.target.value)}
              placeholder="0"
              className="h-10 w-24"
              disabled={isPending}
              aria-label="Comisión de reventa de la agencia (%)"
            />
          </div>

          <Button type="button" className="h-10" onClick={crear} disabled={isPending}>
            <Building2Icon className="mr-1 size-4" />
            Crear e invitar
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Si dejas vacío el correo de contacto, se usa el del admin. La comisión
          es el % que esta agencia cobra cuando otra le revende un viaje; puedes
          ajustar ambos luego en Proveedores.
        </p>
      </CardContent>
    </Card>
  )
}

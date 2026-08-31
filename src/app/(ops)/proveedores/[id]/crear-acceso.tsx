'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PhoneInput } from '@/components/ui/phone-input'
import { CredencialesProvisionales } from '@/components/data/credenciales-provisionales'
import { crearAccesoProveedor } from './acceso-actions'

/** Da acceso (login) al proveedor: crea un profile type='proveedor' ligado a este
 *  supplier y devuelve su contraseña provisional para mandársela. Solo superadmin
 *  (la puerta vive también en la acción). */
export function CrearAcceso({ supplierId }: { supplierId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [creds, setCreds] = useState<{ email: string; password: string } | null>(null)
  const [telCreds, setTelCreds] = useState<string | null>(null)
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [telefono, setTelefono] = useState('')

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setCreds(null)
    startTransition(async () => {
      const res = await crearAccesoProveedor({
        supplierId,
        nombre,
        email: email.trim(),
        telefono: telefono.trim() || undefined,
      })
      if ('error' in res) {
        setError(res.error)
        return
      }
      setNombre('')
      setEmail('')
      setTelefono('')
      setCreds(res.credentials)
      setTelCreds(res.telefono)
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="acc-nombre">Nombre del contacto</Label>
          <Input
            id="acc-nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Persona que entrará"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="acc-email">Correo</Label>
          <Input
            id="acc-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="con este correo entra"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="acc-tel">WhatsApp (opcional)</Label>
          <PhoneInput id="acc-tel" value={telefono} onChange={setTelefono} />
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="sm" disabled={isPending}>
        {isPending ? 'Creando…' : 'Dar acceso'}
      </Button>
      {creds && (
        <CredencialesProvisionales
          credenciales={creds}
          telefono={telCreds}
          titulo="Acceso creado. Mándale estos datos:"
        />
      )}
    </form>
  )
}

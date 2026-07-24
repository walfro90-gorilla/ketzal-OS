'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { crearAccesoProveedor } from './acceso-actions'

/** Da acceso (login) al proveedor: crea un profile type='proveedor' ligado a este
 *  supplier. Solo superadmin (la puerta vive también en la acción). */
export function CrearAcceso({ supplierId }: { supplierId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setOk(false)
    startTransition(async () => {
      const res = await crearAccesoProveedor({
        supplierId,
        nombre,
        email: email.trim() || undefined,
      })
      if ('error' in res) {
        setError(res.error)
        return
      }
      setNombre('')
      setEmail('')
      setOk(true)
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
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
          <Label htmlFor="acc-email">Correo (opcional)</Label>
          <Input
            id="acc-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="opcional"
          />
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {ok && <p className="text-sm text-emerald-600">Acceso creado.</p>}
      <Button type="submit" size="sm" disabled={isPending}>
        {isPending ? 'Creando…' : 'Dar acceso'}
      </Button>
    </form>
  )
}

'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { crearViajero, editarViajero } from './actions'
import type { Viajero } from './viajeros-list'

// Form dual: sin `viajero` = alta (auth + fila); con `viajero` = edición de
// contacto (nombre + teléfono). El correo es la identidad de login: en edición
// se muestra de solo lectura (cambiarlo tocaría auth.users, fuera de alcance).

export function ViajeroForm({ viajero }: { viajero?: Viajero }) {
  const esEdicion = !!viajero
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [nombre, setNombre] = useState(viajero?.full_name ?? '')
  const [email, setEmail] = useState(viajero?.email ?? '')
  const [telefono, setTelefono] = useState(viajero?.phone ?? '')
  const [password, setPassword] = useState('')

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (!nombre.trim()) {
      setError('Escribe el nombre del viajero.')
      return
    }
    if (!esEdicion) {
      if (!/.+@.+\..+/.test(email.trim())) {
        setError('Escribe un correo válido.')
        return
      }
      if (password.length < 8) {
        setError('La contraseña debe tener al menos 8 caracteres.')
        return
      }
    }
    startTransition(async () => {
      if (esEdicion) {
        const res = await editarViajero(viajero!.id, {
          nombre: nombre.trim(),
          telefono: telefono.trim() || undefined,
        })
        if ('error' in res) {
          setError(res.error)
          toast.error(res.error)
        } else {
          toast.success('Viajero actualizado')
          router.push('/viajeros')
          router.refresh()
        }
      } else {
        // En éxito la acción redirige a /viajeros; solo se vuelve aquí con error.
        const res = await crearViajero({
          nombre: nombre.trim(),
          email: email.trim(),
          telefono: telefono.trim() || undefined,
          password,
        })
        if (res?.error) {
          setError(res.error)
          toast.error(res.error)
        }
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="viajero-nombre">Nombre *</Label>
        <Input
          id="viajero-nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre completo"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="viajero-email">Correo {esEdicion ? '' : '*'}</Label>
          <Input
            id="viajero-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="correo@ejemplo.com"
            disabled={esEdicion}
            readOnly={esEdicion}
          />
          {esEdicion && (
            <p className="text-xs text-muted-foreground">
              El correo es el usuario de acceso; no se edita aquí.
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="viajero-telefono">Teléfono</Label>
          <Input
            id="viajero-telefono"
            type="tel"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="Opcional"
          />
        </div>
        {!esEdicion && (
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="viajero-password">Contraseña *</Label>
            <Input
              id="viajero-password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres — compártela con el viajero"
              autoComplete="new-password"
            />
            <p className="text-xs text-muted-foreground">
              La cuenta queda activa de inmediato. El viajero puede cambiarla con
              &quot;recuperar contraseña&quot;.
            </p>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" disabled={isPending}>
        {isPending
          ? esEdicion
            ? 'Guardando…'
            : 'Creando…'
          : esEdicion
            ? 'Guardar cambios'
            : 'Crear viajero'}
      </Button>
    </form>
  )
}

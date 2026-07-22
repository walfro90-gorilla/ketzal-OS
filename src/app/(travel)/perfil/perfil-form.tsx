'use client'

import { useState } from 'react'
import { guardarComprador } from '@/app/comprar/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function PerfilForm({
  nombre: nombreInicial,
  telefono: telefonoInicial,
}: {
  nombre: string
  telefono: string
}) {
  const [nombre, setNombre] = useState(nombreInicial)
  const [telefono, setTelefono] = useState(telefonoInicial)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setMsg(null)
    const res = await guardarComprador({ nombre, telefono })
    setLoading(false)
    setMsg(
      'error' in res
        ? { ok: false, text: res.error }
        : { ok: true, text: 'Datos guardados.' }
    )
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <div className="space-y-2">
        <Label htmlFor="nombre">Nombre</Label>
        <Input
          id="nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          required
          autoComplete="name"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="telefono">Teléfono</Label>
        <Input
          id="telefono"
          type="tel"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          autoComplete="tel"
        />
      </div>
      {msg && (
        <p
          className={msg.ok ? 'text-sm text-muted-foreground' : 'text-sm text-destructive'}
          role={msg.ok ? 'status' : 'alert'}
        >
          {msg.text}
        </p>
      )}
      <Button type="submit" disabled={loading}>
        {loading ? 'Guardando…' : 'Guardar'}
      </Button>
    </form>
  )
}

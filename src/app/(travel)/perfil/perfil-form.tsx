'use client'

import { useState } from 'react'
import { guardarPerfilViajero } from './perfil-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { PhoneInput } from '@/components/ui/phone-input'

export function PerfilForm({
  nombre: nombreInicial,
  telefono: telefonoInicial,
  apodo: apodoInicial,
  viajeSonado: viajeInicial,
  bio: bioInicial,
  ciudad: ciudadInicial,
  publico: publicoInicial,
}: {
  nombre: string
  telefono: string
  apodo: string
  viajeSonado: string
  bio: string
  ciudad: string
  publico: boolean
}) {
  const [nombre, setNombre] = useState(nombreInicial)
  const [telefono, setTelefono] = useState(telefonoInicial)
  const [apodo, setApodo] = useState(apodoInicial)
  const [viajeSonado, setViajeSonado] = useState(viajeInicial)
  const [bio, setBio] = useState(bioInicial)
  const [ciudad, setCiudad] = useState(ciudadInicial)
  const [publico, setPublico] = useState(publicoInicial)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setMsg(null)
    const res = await guardarPerfilViajero({
      nombre,
      telefono,
      apodo,
      viajeSonado,
      bio,
      ciudad,
      publico,
    })
    setLoading(false)
    setMsg(
      'error' in res
        ? { ok: false, text: res.error }
        : { ok: true, text: 'Perfil guardado.' }
    )
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-6">
      {/* Datos de contacto (privados, nunca se muestran a otros viajeros). */}
      <div className="space-y-4">
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
          <PhoneInput id="telefono" value={telefono} onChange={setTelefono} />
          <p className="text-xs text-muted-foreground">
            Privado. Nunca se muestra a otros viajeros.
          </p>
        </div>
      </div>

      {/* Perfil social: lo que verían tus compañeros de viaje si lo prendes. */}
      <div className="space-y-4 rounded-xl border p-4">
        <div>
          <h2 className="text-sm font-semibold">Tu perfil de viajero</h2>
          <p className="text-xs text-muted-foreground">
            Cuéntales a tus compañeros de viaje quién eres.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="apodo">Apodo</Label>
          <Input
            id="apodo"
            value={apodo}
            onChange={(e) => setApodo(e.target.value)}
            maxLength={40}
            placeholder="Cómo te dicen"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ciudad">Ciudad</Label>
          <Input
            id="ciudad"
            value={ciudad}
            onChange={(e) => setCiudad(e.target.value)}
            maxLength={80}
            placeholder="De dónde eres"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="viaje">Viaje soñado</Label>
          <Input
            id="viaje"
            value={viajeSonado}
            onChange={(e) => setViajeSonado(e.target.value)}
            maxLength={140}
            placeholder="Ej. Ver auroras en Islandia"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bio">Sobre ti</Label>
          <Textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={300}
            rows={3}
            placeholder="Un par de líneas sobre ti (opcional)"
          />
        </div>

        <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
          <div className="space-y-0.5">
            <Label htmlFor="publico" className="cursor-pointer">
              Mostrar mi perfil a mis compañeros de viaje
            </Label>
            <p className="text-sm text-muted-foreground">
              Al prenderlo, quienes viajen en tu mismo tour verán tu apodo, tu
              ciudad y tu viaje soñado. Tu nombre completo y tu teléfono nunca se
              muestran. Apagado, tu perfil es privado.
            </p>
          </div>
          <Switch id="publico" checked={publico} onCheckedChange={setPublico} />
        </div>
      </div>

      {msg && (
        <p
          className={
            msg.ok ? 'text-sm text-muted-foreground' : 'text-sm text-destructive'
          }
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

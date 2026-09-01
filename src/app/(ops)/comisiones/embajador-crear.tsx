'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { PhoneInput } from '@/components/ui/phone-input'
import { CredencialesProvisionales } from '@/components/data/credenciales-provisionales'
import { crearEmbajador } from './embajador-actions'

/** Alta rápida de embajador. El correo es OBLIGATORIO (m005): ES el usuario con
 *  el que entra, y antes un correo inventado dejaba la cuenta muerta sin aviso.
 *  Al crearlo salen sus credenciales para mandárselas; el teléfono es opcional y
 *  solo sirve para que el botón de WhatsApp abra su chat directo. El superadmin
 *  además elige de qué agencia es — él no tiene una propia. */
export function CrearEmbajador({
  agencias,
  embajadores = [],
}: {
  /** Solo trae contenido para el superadmin; el admin de agencia usa la suya. */
  agencias?: { id: string; name: string }[]
  /** Para decir quién lo invitó y que ese cobre su bono (b085). */
  embajadores?: { id: string; nombre: string }[]
}) {
  const router = useRouter()
  const eligeAgencia = Boolean(agencias?.length)
  // '' = embajador DIRECTO de Ketzal (sin agencia). Es el default del
  // superadmin: vende de todas las agencias y cobra la tarifa de cada una.
  const [supplierId, setSupplierId] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [nombre, setNombre] = useState('')
  const [codigo, setCodigo] = useState('')
  const [email, setEmail] = useState('')
  const [telefono, setTelefono] = useState('')
  const [invitadoPor, setInvitadoPor] = useState('')
  // Credenciales del recién creado: se ven una vez, para mandarlas.
  const [creds, setCreds] = useState<{ email: string; password: string } | null>(null)
  const [telCreds, setTelCreds] = useState<string | null>(null)

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setCreds(null)
    startTransition(async () => {
      const res = await crearEmbajador({
        nombre,
        codigo,
        email: email.trim() || undefined,
        telefono: telefono.trim() || undefined,
        recruitedBy: invitadoPor || undefined,
        ...(eligeAgencia ? { supplierId } : {}),
      })
      if ('error' in res) {
        setError(res.error)
        return
      }
      setNombre('')
      setCodigo('')
      setEmail('')
      setTelefono('')
      setInvitadoPor('')
      setCreds(res.credentials)
      setTelCreds(res.telefono)
      router.refresh()
    })
  }

  return (
    <form
      onSubmit={submit}
      className="mb-6 space-y-3 rounded-lg border bg-muted/30 p-4"
    >
      <p className="text-sm font-medium">Nuevo embajador</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {eligeAgencia && (
          <div className="space-y-1.5">
            <Label htmlFor="emb-agencia">¿Quién lo recluta?</Label>
            <NativeSelect
              id="emb-agencia"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <option value="">Ketzal (embajador directo)</option>
              {agencias?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </NativeSelect>
            <p className="text-xs text-muted-foreground">
              Solo dice quién lo dio de alta. Cualquier embajador puede vender
              viajes de todas las agencias y cobra la tarifa que cada una fijó.
            </p>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="emb-nombre">Nombre</Label>
          <Input
            id="emb-nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre del embajador"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="emb-codigo">Código de referido</Label>
          <Input
            id="emb-codigo"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="p. ej. MARIA10"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="emb-email">Correo</Label>
          <Input
            id="emb-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="con este correo entra"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="emb-tel">WhatsApp (opcional)</Label>
          <PhoneInput id="emb-tel" value={telefono} onChange={setTelefono} />
        </div>
        {embajadores.length > 0 && (
          <div className="space-y-1.5">
            <Label htmlFor="emb-invito">¿Quién lo invitó? (opcional)</Label>
            <NativeSelect
              id="emb-invito"
              value={invitadoPor}
              onChange={(e) => setInvitadoPor(e.target.value)}
            >
              <option value="">Nadie / llegó solo</option>
              {embajadores.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </NativeSelect>
            <p className="text-xs text-muted-foreground">
              Quien lo invitó gana $300 una sola vez, cuando este embajador logre
              su primera venta. No gana nada más de sus ventas.
            </p>
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="sm" disabled={isPending}>
        {isPending ? 'Creando…' : 'Crear embajador'}
      </Button>
      {creds && (
        <CredencialesProvisionales
          credenciales={creds}
          telefono={telCreds}
          titulo="Embajador creado. Mándale estos datos:"
        />
      )}
    </form>
  )
}

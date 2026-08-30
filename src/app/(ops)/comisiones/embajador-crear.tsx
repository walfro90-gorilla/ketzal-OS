'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { crearEmbajador } from './embajador-actions'

/** Alta rápida de embajador. El correo es OBLIGATORIO (m005): por ahí recibe su
 *  magic-link de acceso, y antes un correo inventado dejaba la cuenta muerta sin
 *  aviso. El superadmin además elige de qué agencia es — él no tiene una propia. */
export function CrearEmbajador({
  agencias,
}: {
  /** Solo trae contenido para el superadmin; el admin de agencia usa la suya. */
  agencias?: { id: string; name: string }[]
}) {
  const router = useRouter()
  const eligeAgencia = Boolean(agencias?.length)
  const [supplierId, setSupplierId] = useState(agencias?.[0]?.id ?? '')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [nombre, setNombre] = useState('')
  const [codigo, setCodigo] = useState('')
  const [email, setEmail] = useState('')

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setOk(false)
    startTransition(async () => {
      const res = await crearEmbajador({
        nombre,
        codigo,
        email: email.trim() || undefined,
        ...(eligeAgencia ? { supplierId } : {}),
      })
      if ('error' in res) {
        setError(res.error)
        return
      }
      setNombre('')
      setCodigo('')
      setEmail('')
      setOk(true)
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
            <Label htmlFor="emb-agencia">Agencia</Label>
            <NativeSelect
              id="emb-agencia"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              {agencias?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </NativeSelect>
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
            placeholder="por aquí recibe su acceso"
          />
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {ok && <p className="text-sm text-emerald-600">Embajador creado.</p>}
      <Button type="submit" size="sm" disabled={isPending}>
        {isPending ? 'Creando…' : 'Crear embajador'}
      </Button>
    </form>
  )
}

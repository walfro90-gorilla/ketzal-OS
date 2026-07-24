'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { crearEmbajador } from './embajador-actions'

/** Alta rápida de embajador (nombre + código de referido, email opcional). */
export function CrearEmbajador() {
  const router = useRouter()
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
          <Label htmlFor="emb-email">Correo (opcional)</Label>
          <Input
            id="emb-email"
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
      {ok && <p className="text-sm text-emerald-600">Embajador creado.</p>}
      <Button type="submit" size="sm" disabled={isPending}>
        {isPending ? 'Creando…' : 'Crear embajador'}
      </Button>
    </form>
  )
}
